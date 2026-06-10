"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import TemaToggle from "./TemaToggle";
import { cerrarSesion } from "@/app/login/actions";

const enlaces = [
  { href: "/", label: "Resumen" },
  { href: "/inventario", label: "Inventario" },
  { href: "/mantenimientos", label: "Mantenimientos" },
  { href: "/tickets", label: "Tickets" },
  { href: "/portal", label: "Portal del empleado" },
];

export default function Sidebar() {
  const ruta = usePathname();
  return (
    <aside className="sidebar">
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
        <TemaToggle />
      </div>
      <nav className="nav">
        {enlaces.map((e) => (
          <Link key={e.href} href={e.href} className={ruta === e.href ? "activo" : ""}>
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
