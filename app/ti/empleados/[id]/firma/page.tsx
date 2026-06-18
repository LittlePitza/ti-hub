import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSupabase } from "@/lib/supabase";
import { getConfigCorreo } from "@/lib/correo";
import { EMPRESA_DEFAULT, type DatosFirma } from "@/lib/firma";
import GeneradorFirma from "@/components/GeneradorFirma";
import SinConexion from "@/components/SinConexion";

export const dynamic = "force-dynamic";

export default async function FirmaEmpleado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <Link href="/ti/empleados" className="portal-volver" style={{ marginBottom: 10 }}>← Empleados</Link>
        <h1 className="pagina-titulo">Firma de correo</h1>
        <p className="pagina-desc">Genera la firma en HTML (ligera y editable) lista para pegar en Outlook o Gmail</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data: emp } = await sb
    .from("empleados")
    .select("nombre, correo, departamento, puesto, extension")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();

  // URL absoluta del logo (debe ser pública para que cargue en el correo):
  // se prefiere sitio_url del panel; si no, el origen de la petición.
  const config = await getConfigCorreo(sb);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origen = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const base = (config?.sitio_url?.replace(/\/+$/, "")) || origen;
  const logoUrl = `${base}/firma-pimsa.png`;

  const initial: DatosFirma = {
    nombre: emp.nombre ?? "",
    puesto: emp.puesto ?? "",
    departamento: emp.departamento ?? "",
    correo: emp.correo ?? "",
    extension: emp.extension ?? "",
    telefono: EMPRESA_DEFAULT.telefono,
    web: EMPRESA_DEFAULT.web,
    direccion: EMPRESA_DEFAULT.direccion,
    eslogan: EMPRESA_DEFAULT.eslogan,
  };

  return (
    <>
      {head}
      <GeneradorFirma initial={initial} logoUrl={logoUrl} />
    </>
  );
}
