"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import TemaToggle from "./TemaToggle";

const enlaces = [
  { href: "/", label: "Resumen" },
  { href: "/inventario", label: "Inventario" },
  { href: "/mantenimientos", label: "Mantenimientos" },
  { href: "/tickets", label: "Tickets" },
];

export default function Sidebar() {
  const ruta = usePathname();
  return (
    <aside className="sidebar">
      <div className="sidebar-cabecera">
        <div className="brand">
          <div className="brand-name">TI Hub</div>
          <div className="brand-sub">depto. sistemas</div>
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
    </aside>
  );
}
