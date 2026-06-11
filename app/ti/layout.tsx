import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSupabase } from "@/lib/supabase";

// Segunda capa de protección además del middleware: si no hay sesión, a /login.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sb = await getSupabase();
  if (sb) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect("/login");
  }
  return (
    <div className="shell">
      <Sidebar />
      <main className="contenido">{children}</main>
    </div>
  );
}
