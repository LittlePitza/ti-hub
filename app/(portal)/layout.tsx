import type { Metadata } from "next";
import Link from "next/link";
import TemaToggle from "@/components/TemaToggle";

export const metadata: Metadata = {
  title: "Soporte TI · Plásticos PIMSA",
  description: "Portal del empleado: reporta problemas de equipo, correo o sistemas al departamento de TI.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-header-inner">
          <Link href="/" className="portal-marca">
            <span className="logo-claro">
              <img src="/pimsa-isotipo.svg" alt="Plásticos PIMSA" />
            </span>
            <div>
              <div className="portal-marca-nombre">Soporte TI</div>
              <div className="portal-marca-sub">Plásticos PIMSA</div>
            </div>
          </Link>
          <TemaToggle />
        </div>
      </header>
      <main className="portal-main">{children}</main>
      <footer className="portal-pie">
        Departamento de TI · Plásticos PIMSA
        {" · "}
        <a href="/ti" className="pie-ti">TI</a>
      </footer>
    </div>
  );
}
