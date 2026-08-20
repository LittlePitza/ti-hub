import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { shortDate, custodyFolio } from "@/lib/utils/format";
import {
  CUSTODY_STATUSES,
  CUSTODY_STATUS_LIST,
  MILESTONES,
  milestonesReached,
  defaultTemplate,
  type CustodyStatus,
} from "@/lib/domain/custody";
import NoConnection from "@/components/ui/NoConnection";
import SubmitButton from "@/components/ui/SubmitButton";
import { deleteCustodyLetter } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Responsivas" };

export default async function Responsivas({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado: filtro, q = "" } = await searchParams;
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Responsivas</h1>
        <p className="pagina-desc">Cartas de resguardo: del borrador a la firma y el archivo</p>
      </div>
      <Link href="/ti/responsivas/plantillas" className="boton secundario">
        Plantillas
      </Link>
    </div>
  );
  if (!sb)
    return (
      <>
        {head}
        <NoConnection />
      </>
    );

  // Only the columns the list renders: the `datos` snapshot (heavy jsonb) is used
  // solely by the detail page.
  const { data } = await sb
    .from("responsivas")
    .select(
      "id, num, plantilla, estado, archivo_url, equipo_nombre, empleado_nombre, empleado_correo, personas, fecha_generada",
    )
    .order("created_at", { ascending: false });
  const todas = data ?? [];

  // Text search first; the status tabs and their counts are computed over the
  // result, so the numbers always match what is on screen.
  const text = q.trim().toLowerCase();
  const conTexto = text
    ? todas.filter((r) => {
        const pl = defaultTemplate(r.plantilla);
        const folio = custodyFolio(pl.prefijoFolio, r.num);
        return [folio, r.equipo_nombre, r.empleado_nombre, r.empleado_correo, pl.nombre]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(text);
      })
    : todas;
  const lista = filtro ? conTexto.filter((r) => r.estado === filtro) : conTexto;

  // Keeps the search term when switching status tabs.
  const qs = text ? `&q=${encodeURIComponent(q.trim())}` : "";
  const hrefTab = (e?: CustodyStatus) =>
    e ? `/ti/responsivas?estado=${e}${qs}` : `/ti/responsivas${qs ? `?${qs.slice(1)}` : ""}`;

  return (
    <>
      {head}

      <nav className="tabs" aria-label="Filtrar por estado">
        <Link href={hrefTab()} className={`tab ${!filtro ? "activo" : ""}`}>
          Todas <span className="tab-num">{conTexto.length}</span>
        </Link>
        {CUSTODY_STATUS_LIST.map((e) => {
          const n = conTexto.filter((r) => r.estado === e).length;
          return (
            <Link key={e} href={hrefTab(e)} className={`tab ${filtro === e ? "activo" : ""}`}>
              {CUSTODY_STATUSES[e].text} <span className="tab-num">{n}</span>
            </Link>
          );
        })}
      </nav>

      <div className="toolbar">
        <form className="filtros" method="get">
          {filtro ? <input type="hidden" name="estado" value={filtro} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por folio, equipo o resguardante…"
            aria-label="Buscar responsivas"
          />
          <button className="boton secundario" type="submit">
            Buscar
          </button>
          {(text || filtro) && (
            <Link href="/ti/responsivas" className="boton-texto">
              Limpiar
            </Link>
          )}
        </form>
      </div>

      {lista.length === 0 ? (
        <div className="vacio">
          <strong>
            {text
              ? "Sin coincidencias"
              : `Sin responsivas ${filtro ? `en «${CUSTODY_STATUSES[filtro as CustodyStatus]?.text}»` : "todavía"}`}
          </strong>
          {text ? (
            "Ajusta la búsqueda o limpia los filtros."
          ) : (
            <>
              Se generan en automático al asignar un equipo a un empleado desde{" "}
              <Link href="/ti/inventario" style={{ textDecoration: "underline" }}>
                Inventario
              </Link>
              .
            </>
          )}
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
              const pl = defaultTemplate(r.plantilla);
              const folio = custodyFolio(pl.prefijoFolio, r.num);
              const hechos = milestonesReached(r.estado, !!r.archivo_url);
              const ins = CUSTODY_STATUSES[r.estado as CustodyStatus] ?? CUSTODY_STATUSES.borrador;
              return (
                <tr key={r.id}>
                  <td>
                    <div className="celda-principal mono">{folio}</div>
                    <div className="suave" style={{ fontSize: 12.5 }}>
                      {pl.nombre}
                    </div>
                  </td>
                  <td>
                    <div className="celda-principal">{r.equipo_nombre ?? "—"}</div>
                    <div className="suave" style={{ fontSize: 12 }}>
                      Generada {shortDate(r.fecha_generada)}
                    </div>
                  </td>
                  <td className="suave">
                    {r.empleado_nombre}
                    {Array.isArray(r.personas) && r.personas.length > 0 && (
                      <span
                        className="insignia neutro"
                        style={{ marginLeft: 6 }}
                        title={`${r.personas.length} persona(s) adicional(es)`}
                      >
                        +{r.personas.length}
                      </span>
                    )}
                    <div style={{ fontSize: 12 }}>{r.empleado_correo}</div>
                  </td>
                  <td>
                    <div className="via" title={r.estado}>
                      {MILESTONES.map((h, i) => (
                        <span key={h} className={`via-nodo ${hechos[i] ? "hecho" : ""}`}>
                          <span className="via-punto" />
                          {h}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`insignia ${ins.tone}`}>{ins.text}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div className="fila-acciones">
                      <Link href={`/ti/responsivas/${r.id}`} className="boton secundario mini">
                        Abrir
                      </Link>
                      <Link
                        href={`/ti/responsivas/${r.id}/imprimir`}
                        className="boton secundario mini"
                      >
                        Imprimir
                      </Link>
                      <form action={deleteCustodyLetter}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="archivo_url" value={r.archivo_url ?? ""} />
                        <SubmitButton
                          className="boton secundario mini"
                          style={{ color: "var(--critico)" }}
                          ocupado="…"
                        >
                          Eliminar
                        </SubmitButton>
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
