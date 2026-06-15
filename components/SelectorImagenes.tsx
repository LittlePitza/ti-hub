"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ADJUNTOS, MAX_BYTES_ADJUNTO, esImagen, esImagenValida } from "@/lib/adjuntos";

// Selector de fotos del reporte (portal del empleado). Vive dentro del
// <form action={crearTicketPortal}>: el <input file> oculto es el que ACARREA
// los archivos al server action; este componente solo lo maneja para dar una
// zona estilizada, previsualización y poder quitar fotos antes de enviar.
//
// El truco: la lista de File se reconstruye en un DataTransfer y se reasigna a
// input.files cada vez que cambia, así el envío del formulario lleva exactamente
// lo que se ve en pantalla (permite acumular varias tandas y quitar individuales).

type Foto = { file: File; url: string };

export default function SelectorImagenes() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  // Vuelca la lista actual al input oculto para que el form la envíe.
  function sincronizar(lista: Foto[]) {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    lista.forEach((f) => dt.items.add(f.file));
    inputRef.current.files = dt.files;
  }

  function agregar(nuevos: FileList | File[]) {
    const entrantes = Array.from(nuevos);
    let mensaje: string | null = null;

    setFotos((prev) => {
      const lista = [...prev];
      for (const file of entrantes) {
        if (!esImagen(file.type)) {
          mensaje = "Solo se pueden adjuntar imágenes (fotos o capturas).";
          continue;
        }
        if (!esImagenValida(file)) {
          mensaje = `“${file.name}” pesa más de ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB.`;
          continue;
        }
        if (lista.length >= MAX_ADJUNTOS) {
          mensaje = `Puedes adjuntar hasta ${MAX_ADJUNTOS} fotos.`;
          break;
        }
        lista.push({ file, url: URL.createObjectURL(file) });
      }
      sincronizar(lista);
      return lista;
    });

    setError(mensaje);
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

  // Liberar los object URLs al desmontar.
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.6" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </span>
        <span className="adjuntos-zona-texto">
          <strong>Toca para elegir fotos</strong>
          <span>o arrástralas aquí · hasta {MAX_ADJUNTOS}</span>
        </span>
      </button>

      {error && <p className="adjuntos-error">{error}</p>}

      {fotos.length > 0 && (
        <ul className="adjuntos-grid">
          {fotos.map((f) => (
            <li key={f.url} className="adjunto-mini">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.file.name} />
              <button
                type="button"
                className="adjunto-quitar"
                onClick={() => quitar(f.url)}
                aria-label={`Quitar ${f.file.name}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
