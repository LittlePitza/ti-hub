"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TemaToggle from "./TemaToggle";
import { cerrarSesion } from "@/app/login/actions";

const enlaces = [
  { href: "/ti", label: "Resumen" },
  { href: "/ti/inventario", label: "Inventario" },
  { href: "/ti/empleados", label: "Empleados" },
  { href: "/ti/mantenimientos", label: "Mantenimientos" },
  { href: "/ti/tickets", label: "Tickets" },
  { href: "/", label: "Portal del empleado" },
];

export default function Sidebar() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  return (
    <aside className={`sidebar ${abierto ? "abierto" : ""}`}>
      <div className="sidebar-cabecera">
        <div className="brand">
          <span className="logo-claro">
            <img className="brand-iso" src="/pimsa-isotipo.svg" alt="" />
          </span>
          <div>
            <div className="brand-name">TI Hub</div>
            <div className="brand-sub">Plásticos PIMSA</div>
          </div>
        </div>
        <div className="sidebar-controles">
          <TemaToggle />
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
      </div>

      <nav className="nav">
        {enlaces.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className={ruta === e.href ? "activo" : ""}
            onClick={() => setAbierto(false)}
          >
            {e.label}
          </Link>
        ))}
      </nav>

      <form action={cerrarSesion} className="sidebar-pie">
        <button type="submit" className="boton-salir">Cerrar sesión</button>
      </form>
    </aside>
  );
}
