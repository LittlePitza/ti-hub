import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Tipografía única de la familia PIMSA (igual que el Portal de Mantenimiento).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TI Hub",
  description: "Inventario, mantenimientos y tickets del departamento de TI",
};

export const viewport: Viewport = {
  // Al exportar un objeto `viewport`, Next.js reemplaza el meta por defecto:
  // hay que declarar width/initial-scale explícitamente o el móvil cae al
  // ancho de respaldo (~980px) y todo se desborda a la derecha.
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1820" },
  ],
};

// Aplica el tema guardado antes del primer pintado para evitar el destello blanco.
const scriptTema = `(function(){try{var t=localStorage.getItem("tema");if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={poppins.variable} suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-poppins)" }}>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
        <style>{`:root { --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }`}</style>
        {children}
      </body>
    </html>
  );
}
