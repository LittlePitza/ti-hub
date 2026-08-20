import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import { getSupabase } from "@/lib/supabase/client";

// Each panel page supplies its own title; the template appends the shared suffix.
export const metadata: Metadata = {
  title: { template: "%s · TI Hub", default: "TI Hub" },
};

// A second layer of protection on top of the middleware: no session means
// /login. getClaims() verifies the JWT locally with the asymmetric key and needs
// no round-trip — the middleware already validated and refreshed the session, so
// the local check is enough here.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sb = await getSupabase();
  if (sb) {
    const { data } = await sb.auth.getClaims();
    if (!data?.claims?.sub) redirect("/login");
  }
  return (
    <div className="shell">
      <Sidebar />
      <main className="contenido">{children}</main>
    </div>
  );
}
