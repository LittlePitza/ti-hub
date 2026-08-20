import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// The single typeface of the PIMSA family (same as the Portal de Mantenimiento).
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
  // Exporting a `viewport` object replaces the Next.js default meta tag, so
  // width/initial-scale have to be declared explicitly — otherwise mobile falls
  // back to the ~980px fallback width and everything overflows to the right.
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1820" },
  ],
};

// Applies the stored theme before first paint to avoid the white flash.
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
