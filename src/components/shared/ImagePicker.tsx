"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ATTACHMENTS, MAX_SOURCE_BYTES, isImage } from "@/lib/utils/attachments";

// Compresses the photo in the browser before uploading: rescales it to a sane
// maximum and re-encodes to WebP (much lighter than JPEG/PNG/HEIC), so the file
// travels small and is stored in a light format. `createImageBitmap` with
// `imageOrientation:"from-image"` applies the EXIF orientation (portrait phone
// photos). If the browser cannot do it, the original file is returned.
const MAX_LADO = 1600;
const CALIDAD = 0.82;

async function compressInBrowser(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let { width, height } = bitmap;
    if (width > MAX_LADO || height > MAX_LADO) {
      const escala = MAX_LADO / Math.max(width, height);
      width = Math.round(width * escala);
      height = Math.round(height * escala);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", CALIDAD));
    // If WebP was unavailable or did not help (already a tiny image), keep the
    // original.
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], nombre, { type: "image/webp" });
  } catch {
    return file;
  }
}

// Photo picker for a report (employee portal). It lives inside the
// <form action={createPortalReport}>: the hidden <input file> is what actually
// CARRIES the files to the server action; this component only drives it to
// provide a styled drop zone, previews, and the ability to remove photos before
// submitting.
//
// The trick: the File list is rebuilt in a DataTransfer and reassigned to
// input.files whenever it changes, so the form submission carries exactly what is
// on screen (which allows accumulating several batches and removing individual
// photos).

type Photo = { file: File; url: string };

export default function ImagePicker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  // Flushes the current list into the hidden input so the form submits it.
  function sincronizar(lista: Photo[]) {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    lista.forEach((f) => dt.items.add(f.file));
    inputRef.current.files = dt.files;
  }

  async function agregar(nuevos: FileList | File[]) {
    let mensaje: string | null = null;
    const candidatos: File[] = [];
    for (const file of Array.from(nuevos)) {
      if (!isImage(file.type)) {
        mensaje = "Solo se pueden adjuntar imágenes (fotos o capturas).";
        continue;
      }
      if (file.size > MAX_SOURCE_BYTES) {
        mensaje = `“${file.name}” es demasiado grande.`;
        continue;
      }
      candidatos.push(file);
    }
    setError(mensaje);

    const comprimidos = await Promise.all(candidatos.map(compressInBrowser));
    setFotos((prev) => {
      const lista = [...prev];
      for (const file of comprimidos) {
        if (lista.length >= MAX_ATTACHMENTS) {
          setError(`Puedes adjuntar hasta ${MAX_ATTACHMENTS} fotos.`);
          break;
        }
        lista.push({ file, url: URL.createObjectURL(file) });
      }
      sincronizar(lista);
      return lista;
    });
  }

  function quitar(url: string) {
    setError(null);
    setFotos((prev) => {
      const lista = prev.filter((f) => f.url !== url);
      sincronizar(lista);
      return lista;
    });
    URL.revokeObjectURL(url);
  }

  // Release the object URLs on unmount.
  useEffect(() => () => fotos.forEach((f) => URL.revokeObjectURL(f.url)), [fotos]);

  return (
    <div className="adjuntos">
      <input
        ref={inputRef}
        type="file"
        name="imagenes"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) agregar(e.target.files);
        }}
      />

      <button
        type="button"
        className={`adjuntos-zona${arrastrando ? " activa" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (e.dataTransfer.files?.length) agregar(e.dataTransfer.files);
        }}
      >
        <span className="adjuntos-zona-icono" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.6" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </span>
        <span className="adjuntos-zona-texto">
          <strong>Toca para elegir fotos</strong>
          <span>o arrástralas aquí · hasta {MAX_ATTACHMENTS}</span>
        </span>
      </button>

      {error && <p className="adjuntos-error">{error}</p>}

      {fotos.length > 0 && (
        <ul className="adjuntos-grid">
          {fotos.map((f) => (
            <li key={f.url} className="adjunto-mini">
              <img src={f.url} alt={f.file.name} />
              <button
                type="button"
                className="adjunto-quitar"
                onClick={() => quitar(f.url)}
                aria-label={`Quitar ${f.file.name}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
