"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  signatureHtml,
  signatureDocument,
  signaturePlainText,
  type SignatureData,
} from "@/lib/domain/signature";

type CopyState = "" | "firma" | "html";

function slug(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "empleado"
  );
}

// The signature-generation panel: an editable form on the left and a live
// preview on the right. "Copiar firma" puts the rich HTML on the clipboard so it
// pastes formatted into Outlook or Gmail.
export default function SignatureBuilder({
  initial,
  logoUrl,
}: {
  initial: SignatureData;
  logoUrl: string;
}) {
  const [d, setD] = useState<SignatureData>(initial);
  const [copia, setCopia] = useState<CopyState>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const html = useMemo(() => signatureHtml(d, logoUrl), [d, logoUrl]);

  const set = (k: keyof SignatureData) => (ev: React.ChangeEvent<HTMLInputElement>) =>
    setD((prev) => ({ ...prev, [k]: ev.target.value }));

  const marca = (k: CopyState) => {
    setCopia(k);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopia(""), 1500);
  };

  const copiarFirma = async () => {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([signaturePlainText(d)], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      marca("firma");
    } catch {
      /* the browser may block the clipboard without a user gesture */
    }
  };

  const copiarHtml = async () => {
    try {
      await navigator.clipboard.writeText(signatureDocument(html));
      marca("html");
    } catch {
      /* no clipboard permission */
    }
  };

  const descargar = () => {
    const blob = new Blob([signatureDocument(html)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `firma-${slug(d.nombre)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const campo = (k: keyof SignatureData, label: string, ancho = false, placeholder = "") => (
    <div className={`campo ${ancho ? "ancho" : ""}`}>
      <label htmlFor={`f-${k}`}>{label}</label>
      <input
        id={`f-${k}`}
        value={d[k]}
        onChange={set(k)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );

  return (
    <div className="firma-gen">
      <form className="formulario firma-form" onSubmit={(e) => e.preventDefault()}>
        <h2>Datos de la firma</h2>
        <div className="campos">
          {campo("nombre", "Nombre completo")}
          {campo("puesto", "Puesto")}
          {campo("departamento", "Departamento")}
          {campo("correo", "Correo")}
          {campo("extension", "Extensión")}
          {campo("web", "Sitio web")}
          {campo("direccion", "Dirección", true)}
          {campo("eslogan", "Eslogan", true)}
        </div>
        <p className="suave" style={{ fontSize: 12.5, marginTop: 2 }}>
          Los campos vacíos no aparecen en la firma. Los datos de empresa traen valores PIMSA por
          defecto.
        </p>
      </form>

      <div className="firma-preview">
        <div className="firma-preview-head">Vista previa</div>
        <div className="firma-lienzo" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="firma-acciones">
          <button type="button" className="boton" onClick={copiarFirma}>
            {copia === "firma" ? "Copiado" : "Copiar firma"}
          </button>
          <button type="button" className="boton secundario" onClick={copiarHtml}>
            {copia === "html" ? "Copiado" : "Copiar HTML"}
          </button>
          <button type="button" className="boton secundario" onClick={descargar}>
            Descargar .html
          </button>
        </div>
        <p className="suave" style={{ fontSize: 12.5 }}>
          “Copiar firma” la deja lista para pegar formateada en Outlook o Gmail. El logo carga desde
          el sitio, así que se ve cuando el correo permite imágenes.
        </p>
      </div>
    </div>
  );
}
