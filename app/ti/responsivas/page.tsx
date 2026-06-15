import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folioResponsiva } from "@/lib/format";
import {
  ESTADOS_RESP,
  ESTADOS_RESP_LISTA,
  HITOS,
  hitosCumplidos,
  plantillaDefault,
  type EstadoResponsiva,
} from "@/lib/responsivas";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import { eliminarResponsiva } from "./actions";

export const dynamic = "force-dynamic";

export default async function Responsivas({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado: filtro } = await searchParams;
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Responsivas</h1>
        <p className="pagina-desc">Cartas de resguardo: del borrador a la firma y el archivo</p>
      </div>
      <Link href="/ti/responsivas/plantillas" className="boton secundario">Plantillas</Link>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data } = await sb.from("responsivas").select("*").order("created_at", { ascending: false });
  const todas = data ?? [];
  const lista = filtro ? todas.filter((r) => r.estado === filtro) : todas;

  return (
    <>
      {head}

      <nav className="tabs" aria-label="Filtrar por estado">
        <Link href="/ti/responsivas" className={`tab ${!filtro ? "activo" : ""}`}>
          Todas <span className="tab-num">{todas.length}</span>
        </Link>
        {ESTADOS_RESP_LISTA.map((e) => {
          const n = todas.filter((r) => r.estado === e).length;
          return (
            <Link key={e} href={`/ti/responsivas?estado=${e}`} className={`tab ${filtro === e ? "activo" : ""}`}>
              {ESTADOS_RESP[e].texto} <span className="tab-num">{n}</span>
            </Link>
          );
        })}
      </nav>

      {lista.length === 0 ? (
        <div className="vacio">
          <strong>Sin responsivas {filtro ? `en «${ESTADOS_RESP[filtro as EstadoResponsiva]?.texto}»` : "todavía"}</strong>
          Se generan en automático al asignar un equipo a un empleado desde <Link href="/ti/inventario" style={{ textDecoration: "underline" }}>Inventario</Link>.
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Folio · documento</th>
              <th>Equipo</th>
              <th>Resguardante</th>
              <th>Ciclo de resguardo</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r) => {
              const pl = plantillaDefault(r.plantilla);
              const folio = folioResponsiva(pl.prefijoFolio, r.num);
              const hechos = hitosCumplidos(r.estado, !!r.archivo_url);
              const ins = ESTADOS_RESP[r.estado as EstadoResponsiva] ?? ESTADOS_RESP.borrador;
              return (
                <tr key={r.id}>
                  <td>
                    <div className="celda-principal mono">{folio}</div>
                    <div className="suave" style={{ fontSize: 12.5 }}>{pl.nombre}</div>
                  </td>
                  <td>
                    <div className="celda-principal">{r.equipo_nombre ?? "—"}</div>
                    <div className="suave" style={{ fontSize: 12 }}>Generada {fechaCorta(r.fecha_generada)}</div>
                  </td>
                  <td className="suave">
                    {r.empleado_nombre}
                    <div style={{ fontSize: 12 }}>{r.empleado_correo}</div>
                  </td>
                  <td>
                    <div className="via" title={r.estado}>
                      {HITOS.map((h, i) => (
                        <span key={h} className={`via-nodo ${hechos[i] ? "hecho" : ""}`}>
                          <span className="via-punto" />
                          {h}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td><span className={`insignia ${ins.tono}`}>{ins.texto}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div className="fila-acciones">
                      <Link href={`/ti/responsivas/${r.id}`} className="boton secundario mini">Abrir</Link>
                      <Link href={`/ti/responsivas/${r.id}/imprimir`} className="boton secundario mini">Imprimir</Link>
                      <form action={eliminarResponsiva}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="archivo_url" value={r.archivo_url ?? ""} />
                        <BotonEnviar className="boton secundario mini" style={{ color: "var(--critico)" }} ocupado="…">Eliminar</BotonEnviar>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
