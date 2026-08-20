import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSupabase } from "@/lib/supabase/client";
import { getEmailConfig } from "@/lib/domain/email";
import { DEFAULT_COMPANY, type SignatureData } from "@/lib/domain/signature";
import SignatureBuilder from "@/components/custody/SignatureBuilder";
import SubmitButton from "@/components/ui/SubmitButton";
import NoConnection from "@/components/ui/NoConnection";
import { saveSignatureSettings } from "../../actions";

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
        <Link href="/ti/empleados" className="portal-volver" style={{ marginBottom: 10 }}>
          ← Empleados
        </Link>
        <h1 className="pagina-titulo">Firma de correo</h1>
        <p className="pagina-desc">
          Genera la firma en HTML (ligera y editable) lista para pegar en Outlook o Gmail
        </p>
      </div>
    </div>
  );
  if (!sb)
    return (
      <>
        {head}
        <NoConnection />
      </>
    );

  const { data: emp } = await sb
    .from("empleados")
    .select("nombre, correo, departamento, puesto, extension")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();

  // Company defaults: configurable (config_correo), falling back to the constants.
  const config = await getEmailConfig(sb);
  const empresa = {
    web: config?.firma_web ?? DEFAULT_COMPANY.web,
    direccion: config?.firma_direccion ?? DEFAULT_COMPANY.direccion,
    eslogan: config?.firma_eslogan ?? DEFAULT_COMPANY.eslogan,
  };

  // Absolute logo URL (it has to be public so it loads inside the email): the
  // panel's sitio_url is preferred, otherwise the request origin.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origen = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const base = config?.sitio_url?.replace(/\/+$/, "") || origen;
  const logoUrl = `${base}/firma-pimsa.png`;

  const initial: SignatureData = {
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
          <div>
            <strong>Valores por defecto guardados</strong> Se aplicarán a las firmas que generes a
            partir de ahora.
          </div>
        </div>
      ) : null}

      <SignatureBuilder initial={initial} logoUrl={logoUrl} />

      <details className="plegable" style={{ marginTop: 28 }}>
        <summary>Valores por defecto de la empresa</summary>
        <form className="formulario plano" action={saveSignatureSettings}>
          <input type="hidden" name="id" value={id} />
          <p className="suave" style={{ fontSize: 13, marginBottom: 12 }}>
            Estos datos prellenan la firma de <strong>todos</strong> los empleados. El nombre,
            puesto, correo y extensión salen del registro de cada quien.
          </p>
          <div className="campos">
            <div className="campo">
              <label htmlFor="firma_web">Sitio web</label>
              <input
                id="firma_web"
                name="firma_web"
                defaultValue={empresa.web}
                placeholder={DEFAULT_COMPANY.web}
              />
            </div>
            <div className="campo">
              <label htmlFor="firma_direccion">Dirección</label>
              <input
                id="firma_direccion"
                name="firma_direccion"
                defaultValue={empresa.direccion}
                placeholder={DEFAULT_COMPANY.direccion}
              />
            </div>
            <div className="campo ancho">
              <label htmlFor="firma_eslogan">Eslogan</label>
              <input
                id="firma_eslogan"
                name="firma_eslogan"
                defaultValue={empresa.eslogan}
                placeholder={DEFAULT_COMPANY.eslogan}
              />
            </div>
          </div>
          <SubmitButton className="boton" ocupado="Guardando…">
            Guardar valores por defecto
          </SubmitButton>
        </form>
      </details>
    </>
  );
}
