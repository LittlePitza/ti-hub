"use client";

import { useEffect, useRef, useState } from "react";
import type { CredentialSet } from "@/lib/domain/inventory";

// The device's "Credenciales y accesos" section (IT panel only). The whole block
// is interactive — show/hide/copy passwords and a list of credentials that can be
// added and removed — so it lives in a single client component. The state is
// serialised into a hidden <input name="accesos"> as JSON; the server action
// reads and sanitises it (sanitizeCredentials). The visible inputs carry no `name`.

type ExtraRow = { key: number; etiqueta: string; usuario: string; secreto: string };

// Static icon hoisted out of the component so it is not recreated on each render.
const CANDADO = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Masked input with Show/Hide and Copy/Copied text actions.
function CampoSecreto({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copiar = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiado(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(false), 1500);
    } catch {
      // clipboard unavailable (insecure context): ignored
    }
  };

  return (
    <div className="campo-secreto">
      <input
        type={visible ? "text" : "password"}
        className="mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        spellCheck={false}
        aria-label={label}
      />
      <button
        type="button"
        className="boton-texto"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
      <button type="button" className="boton-texto" onClick={copiar} disabled={!value}>
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export default function DeviceCredentials({ value }: { value?: CredentialSet | null }) {
  const [rustdesk, setRustdesk] = useState(() => ({
    id: value?.rustdesk?.id ?? "",
    pass: value?.rustdesk?.pass ?? "",
  }));
  const [admin, setAdmin] = useState(() => ({
    usuario: value?.admin?.usuario ?? "",
    pass: value?.admin?.pass ?? "",
  }));
  const keyRef = useRef(0);
  const [extra, setExtra] = useState<ExtraRow[]>(() =>
    (value?.extra ?? []).map((e) => ({
      key: keyRef.current++,
      etiqueta: e.etiqueta,
      usuario: e.usuario,
      secreto: e.secreto,
    })),
  );

  const agregar = () =>
    setExtra((prev) => [
      ...prev,
      { key: keyRef.current++, etiqueta: "", usuario: "", secreto: "" },
    ]);
  const quitar = (key: number) => setExtra((prev) => prev.filter((e) => e.key !== key));
  const editar = (key: number, campo: keyof Omit<ExtraRow, "key">, v: string) =>
    setExtra((prev) => prev.map((e) => (e.key === key ? { ...e, [campo]: v } : e)));

  const payload = JSON.stringify({
    rustdesk,
    admin,
    extra: extra.map((e) => ({ etiqueta: e.etiqueta, usuario: e.usuario, secreto: e.secreto })),
  });

  return (
    <section className="accesos">
      <input type="hidden" name="accesos" value={payload} />
      <div className="accesos-titulo">{CANDADO} Credenciales y accesos</div>

      <div className="acceso-grupo">
        <span className="acceso-etiqueta">RustDesk</span>
        <div className="acceso-par">
          <input
            value={rustdesk.id}
            onChange={(e) => setRustdesk((r) => ({ ...r, id: e.target.value }))}
            placeholder="ID de RustDesk"
            autoComplete="off"
            spellCheck={false}
            aria-label="ID de RustDesk"
            className="mono"
          />
          <CampoSecreto
            value={rustdesk.pass}
            onChange={(v) => setRustdesk((r) => ({ ...r, pass: v }))}
            label="Contraseña de RustDesk"
            placeholder="Contraseña"
          />
        </div>
      </div>

      <div className="acceso-grupo">
        <span className="acceso-etiqueta">Administrador del equipo</span>
        <div className="acceso-par">
          <input
            value={admin.usuario}
            onChange={(e) => setAdmin((a) => ({ ...a, usuario: e.target.value }))}
            placeholder="Usuario"
            autoComplete="off"
            spellCheck={false}
            aria-label="Usuario administrador"
            className="mono"
          />
          <CampoSecreto
            value={admin.pass}
            onChange={(v) => setAdmin((a) => ({ ...a, pass: v }))}
            label="Contraseña de administrador"
            placeholder="Contraseña"
          />
        </div>
      </div>

      <div className="acceso-grupo">
        <span className="acceso-etiqueta">Otros accesos</span>
        {extra.length === 0 ? (
          <p className="suave acceso-vacio">Sin accesos adicionales.</p>
        ) : (
          <ul className="acceso-extra">
            {extra.map((e) => (
              <li key={e.key} className="acceso-fila">
                <input
                  value={e.etiqueta}
                  onChange={(ev) => editar(e.key, "etiqueta", ev.target.value)}
                  placeholder="Etiqueta (AnyDesk, VPN…)"
                  autoComplete="off"
                  aria-label="Etiqueta del acceso"
                />
                <input
                  value={e.usuario}
                  onChange={(ev) => editar(e.key, "usuario", ev.target.value)}
                  placeholder="Usuario (opcional)"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Usuario del acceso"
                  className="mono"
                />
                <CampoSecreto
                  value={e.secreto}
                  onChange={(v) => editar(e.key, "secreto", v)}
                  label="Contraseña del acceso"
                  placeholder="Contraseña / clave"
                />
                <button
                  type="button"
                  className="boton-texto acceso-quitar"
                  onClick={() => quitar(e.key)}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="boton secundario mini acceso-agregar" onClick={agregar}>
          + Agregar acceso
        </button>
      </div>
    </section>
  );
}
