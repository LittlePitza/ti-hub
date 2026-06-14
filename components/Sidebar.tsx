"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TemaToggle from "./TemaToggle";
import { cerrarSesion } from "@/app/login/actions";

// Navegación agrupada por función, como una consola de operaciones: primero la
// vista general, luego el trabajo del día (tickets, mantenimientos) y al final
// los activos que se administran. El portal del empleado vive aparte, en el pie.
const GRUPOS: { titulo: string; items: { href: string; label: string; icono: ReactNode }[] }[] = [
  {
    titulo: "Panel",
    items: [{ href: "/ti", label: "Resumen", icono: <IcoResumen /> }],
  },
  {
    titulo: "Soporte",
    items: [
      { href: "/ti/tickets", label: "Tickets", icono: <IcoTickets /> },
      { href: "/ti/mantenimientos", label: "Mantenimientos", icono: <IcoManto /> },
    ],
  },
  {
    titulo: "Activos",
    items: [
      { href: "/ti/inventario", label: "Inventario", icono: <IcoInventario /> },
      { href: "/ti/empleados", label: "Empleados", icono: <IcoEmpleados /> },
    ],
  },
];

export default function Sidebar() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  return (
    <aside className={`rail ${abierto ? "abierto" : ""}`}>
      <div className="rail-cabecera">
        <Link href="/ti" className="brand" onClick={() => setAbierto(false)}>
          <span className="logo-claro">
            <img className="brand-iso" src="/pimsa-isotipo.svg" alt="" />
          </span>
          <div>
            <div className="brand-name">TI Hub</div>
            <div className="brand-sub">Consola · PIMSA</div>
          </div>
        </Link>
        <button
          type="button"
          className="hamburguesa"
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={abierto}
          onClick={() => setAbierto(!abierto)}
        >
          {abierto ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      <nav className="rail-nav" aria-label="Secciones del panel">
        {GRUPOS.map((g) => (
          <div className="rail-grupo" key={g.titulo}>
            <span className="rail-grupo-titulo">{g.titulo}</span>
            {g.items.map((e) => (
              <Link
                key={e.href}
                href={e.href}
                className={`rail-link ${ruta === e.href ? "activo" : ""}`}
                onClick={() => setAbierto(false)}
              >
                {e.icono}
                <span>{e.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="rail-pie">
        <Link href="/" className="rail-portal" onClick={() => setAbierto(false)}>
          <IcoPortal />
          <span>Portal del empleado</span>
        </Link>
        <div className="rail-pie-fila">
          <form action={cerrarSesion} style={{ flex: 1 }}>
            <button type="submit" className="rail-salir">Cerrar sesión</button>
          </form>
          <TemaToggle />
        </div>
      </div>
    </aside>
  );
}

/* Iconos de línea (1.7px), heredan currentColor del riel. */
function IcoResumen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function IcoTickets() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2.5" />
    </svg>
  );
}
function IcoManto() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L4 17l3 3 5.4-5.3a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.3-2.3z" />
    </svg>
  );
}
function IcoInventario() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21 8-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="m12 13 0 8" />
    </svg>
  );
}
function IcoEmpleados() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6" />
      <path d="M17.5 20a5.5 5.5 0 0 0-2.3-4.5" />
    </svg>
  );
}
function IcoPortal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12 12 4l9 8" />
      <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
