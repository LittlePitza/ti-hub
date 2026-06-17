import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getSupabase } from "@/lib/supabase";

// Segunda capa de protección además del middleware: si no hay sesión, a /login.
// getClaims() verifica el JWT localmente (llave asimétrica) sin viaje de red —
// el middleware ya validó/refrescó la sesión, aquí basta con la verificación local.
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
