import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "TI Hub",
  description: "Inventario, mantenimientos y tickets del departamento de TI",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#111215" },
  ],
};

// Aplica el tema guardado antes del primer pintado para evitar el destello blanco.
const scriptTema = `(function(){try{var t=localStorage.getItem("tema");if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-geist-sans)" }}>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
        <style>{`:root { --font-mono: var(--font-geist-mono); }`}</style>
        {children}
      </body>
    </html>
  );
}
