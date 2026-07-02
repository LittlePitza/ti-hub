import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSupabase } from "@/lib/supabase";
import { getConfigCorreo } from "@/lib/correo";
import { EMPRESA_DEFAULT, type DatosFirma } from "@/lib/firma";
import GeneradorFirma from "@/components/GeneradorFirma";
import BotonEnviar from "@/components/BotonEnviar";
import SinConexion from "@/components/SinConexion";
import { guardarAjustesFirma } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Firma de correo" };

export default async function FirmaEmpleado({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ajustes?: string }>;
}) {
  const { id } = await params;
  const { ajustes } = await searchParams;
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

  // Valores por defecto de empresa: configurables (config_correo) con respaldo a las constantes.
  const config = await getConfigCorreo(sb);
  const empresa = {
    web: config?.firma_web ?? EMPRESA_DEFAULT.web,
    direccion: config?.firma_direccion ?? EMPRESA_DEFAULT.direccion,
    eslogan: config?.firma_eslogan ?? EMPRESA_DEFAULT.eslogan,
  };

  // URL absoluta del logo (debe ser pública para que cargue en el correo):
  // se prefiere sitio_url del panel; si no, el origen de la petición.
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
    web: empresa.web,
    direccion: empresa.direccion,
    eslogan: empresa.eslogan,
  };

  return (
    <>
      {head}

      {ajustes ? (
        <div className="banner-exito" style={{ marginBottom: 20 }}>
          <div><strong>Valores por defecto guardados</strong> Se aplicarán a las firmas que generes a partir de ahora.</div>
        </div>
      ) : null}

      <GeneradorFirma initial={initial} logoUrl={logoUrl} />

      <details className="plegable" style={{ marginTop: 28 }}>
        <summary>Valores por defecto de la empresa</summary>
        <form className="formulario plano" action={guardarAjustesFirma}>
          <input type="hidden" name="id" value={id} />
          <p className="suave" style={{ fontSize: 13, marginBottom: 12 }}>
            Estos datos prellenan la firma de <strong>todos</strong> los empleados. El nombre, puesto, correo y
            extensión salen del registro de cada quien.
          </p>
          <div className="campos">
            <div className="campo">
              <label htmlFor="firma_web">Sitio web</label>
              <input id="firma_web" name="firma_web" defaultValue={empresa.web} placeholder={EMPRESA_DEFAULT.web} />
            </div>
            <div className="campo">
              <label htmlFor="firma_direccion">Dirección</label>
              <input id="firma_direccion" name="firma_direccion" defaultValue={empresa.direccion} placeholder={EMPRESA_DEFAULT.direccion} />
            </div>
            <div className="campo ancho">
              <label htmlFor="firma_eslogan">Eslogan</label>
              <input id="firma_eslogan" name="firma_eslogan" defaultValue={empresa.eslogan} placeholder={EMPRESA_DEFAULT.eslogan} />
            </div>
          </div>
          <BotonEnviar className="boton" ocupado="Guardando…">Guardar valores por defecto</BotonEnviar>
        </form>
      </details>
    </>
  );
}
