import type { Metadata } from "next";
import { Signika } from "next/font/google";
import TemaToggle from "@/components/TemaToggle";

// Tipografía de la marca PIMSA (el panel de TI conserva Geist).
const signika = Signika({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Soporte TI · Plásticos PIMSA",
  description: "Portal del empleado: reporta problemas de equipo, correo o sistemas al departamento de TI.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`portal-shell ${signika.className}`}>
      <header className="portal-header">
        <div className="portal-header-inner">
          <div className="portal-marca">
            <span className="logo-claro">
              <img src="/pimsa-isotipo.svg" alt="Plásticos PIMSA" />
            </span>
            <div>
              <div className="portal-marca-nombre">Soporte TI</div>
              <div className="portal-marca-sub">Plásticos PIMSA</div>
            </div>
          </div>
          <TemaToggle />
        </div>
      </header>
      <main className="portal-main">{children}</main>
      <footer className="portal-pie">
        Departamento de TI · Plásticos Industriales de Monterrey, S.A. de C.V.
        {" · "}
        <a href="/ti" className="pie-ti">TI</a>
      </footer>
    </div>
  );
}
