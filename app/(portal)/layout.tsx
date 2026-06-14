import type { Metadata } from "next";
import Link from "next/link";
import { Signika, Signika_Negative } from "next/font/google";
import TemaToggle from "@/components/TemaToggle";

// Tipografía de la marca PIMSA: par display + cuerpo (el panel de TI conserva Geist).
// Signika Negative es la cara de títulos de la identidad oficial; aquí en peso
// ligero a gran tamaño da una voz calmada para quien llega con un problema.
const signika = Signika({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-portal",
});
const signikaDisplay = Signika_Negative({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-portal-display",
});

export const metadata: Metadata = {
  title: "Soporte TI · Plásticos PIMSA",
  description: "Portal del empleado: reporta problemas de equipo, correo o sistemas al departamento de TI.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`portal-shell ${signika.variable} ${signikaDisplay.variable}`}>
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
        Departamento de TI · Plásticos Industriales de Monterrey, S.A. de C.V.
        {" · "}
        <a href="/ti" className="pie-ti">TI</a>
      </footer>
    </div>
  );
}
