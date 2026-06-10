import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "TI Hub",
  description: "Inventario, mantenimientos y tickets del departamento de TI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body style={{ fontFamily: "var(--font-geist-sans)" }}>
        <style>{`:root { --font-mono: var(--font-geist-mono); }`}</style>
        <div className="shell">
          <Sidebar />
          <main className="contenido">{children}</main>
        </div>
      </body>
    </html>
  );
}
