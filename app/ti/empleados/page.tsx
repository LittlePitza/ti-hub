import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { CATEGORIAS_INV } from "@/lib/inventario";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import ModalGestionar from "@/components/ModalGestionar";
import { crearEmpleado, cambiarEstadoEmpleado, editarEmpleado, eliminarEmpleado } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empleados" };

const ETIQUETA_CAT: Record<string, string> = Object.fromEntries(
  CATEGORIAS_INV.map((c) => [c.valor, c.singular]),
);

type Equipo = { nombre: string; categoria: string; asignado_email: string | null };

export default async function Empleados({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; depto?: string; equipos?: string; portal?: string }>;
}) {
  const { q = "", estado = "", depto = "", equipos: equiposFiltro = "", portal = "" } = await searchParams;
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Empleados</h1>
        <p className="pagina-desc">Directorio y equipos asignados; el correo los liga al portal</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const [empleadosQ, equiposQ, ticketsQ] = await Promise.all([
    sb.from("empleados").select("id, nombre, correo, departamento, puesto, extension, estado").order("nombre"),
    sb.from("equipos").select("nombre, categoria, asignado_email").not("asignado_email", "is", null).neq("estado", "baja"),
    sb.from("tickets").select("solicitante_email").not("solicitante_email", "is", null),
  ]);
  const empleados = empleadosQ.data ?? [];
  const equipos = (equiposQ.data ?? []) as Equipo[];

  // Un solo índice correo -> equipos (en vez de filtrar la lista por cada fila).
  const equiposPorCorreo = new Map<string, Equipo[]>();
  for (const e of equipos) {
    if (!e.asignado_email) continue;
    const arr = equiposPorCorreo.get(e.asignado_email);
    if (arr) arr.push(e);
    else equiposPorCorreo.set(e.asignado_email, [e]);
  }
  const equiposDe = (correo: string) => equiposPorCorreo.get(correo) ?? [];
  // Correos con actividad en el portal = que han levantado al menos un reporte.
  const portalActivo = new Set(
    (ticketsQ.data ?? []).map((t) => t.solicitante_email as string | null).filter(Boolean) as string[],
  );

  // Resumen sobre la lista completa (estable, sin filtros).
  const resumen = {
    total: empleados.length,
    activos: empleados.filter((p) => p.estado === "activo").length,
    baja: empleados.filter((p) => p.estado === "baja").length,
    conEquipos: empleados.filter((p) => equiposDe(p.correo).length > 0).length,
    sinEquipos: empleados.filter((p) => equiposDe(p.correo).length === 0).length,
  };
  const departamentos = [...new Set(empleados.map((p) => p.departamento).filter(Boolean) as string[])].sort();

  // Filtros server (vía URL params), aplicados sobre la lista.
  const texto = q.trim().toLowerCase();
  let lista = empleados;
  if (estado) lista = lista.filter((p) => p.estado === estado);
  if (depto) lista = lista.filter((p) => (p.departamento ?? "") === depto);
  if (equiposFiltro === "con") lista = lista.filter((p) => equiposDe(p.correo).length > 0);
  if (equiposFiltro === "sin") lista = lista.filter((p) => equiposDe(p.correo).length === 0);
  if (portal === "con") lista = lista.filter((p) => portalActivo.has(p.correo));
  if (portal === "sin") lista = lista.filter((p) => !portalActivo.has(p.correo));
  if (texto) {
    lista = lista.filter((p) =>
      [p.nombre, p.correo, p.departamento, p.puesto]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(texto),
    );
  }
  const hayFiltro = Boolean(texto || estado || depto || equiposFiltro || portal);

  return (
    <>
      {head}

      {/* Resumen del directorio: panorama de un vistazo. */}
      <div className="metricas compacta inv-resumen">
        <div className="metrica">
          <div className="metrica-valor">{resumen.total}</div>
          <div className="metrica-label">Total</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.activos}</div>
          <div className="metrica-label">Activos</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${resumen.baja ? "alerta" : ""}`}>{resumen.baja}</div>
          <div className="metrica-label">Baja</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.conEquipos}</div>
          <div className="metrica-label">Con equipos</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{resumen.sinEquipos}</div>
          <div className="metrica-label">Sin equipos</div>
        </div>
      </div>

      {/* Alta colapsada para que el directorio sea la protagonista. */}
      <details className="plegable">
        <summary>Dar de alta empleado</summary>
        <form className="formulario plano" action={crearEmpleado}>
          <div className="campos">
            <div className="campo">
              <label htmlFor="em-nombre">Nombre completo</label>
              <input id="em-nombre" name="nombre" required placeholder="María López" />
            </div>
            <div className="campo">
              <label htmlFor="em-correo">Correo</label>
              <input id="em-correo" name="correo" type="email" required placeholder="maria.lopez@plasticospimsa.com" />
            </div>
            <div className="campo">
              <label htmlFor="em-depto">Departamento</label>
              <input id="em-depto" name="departamento" placeholder="Administración" />
            </div>
            <div className="campo">
              <label htmlFor="em-puesto">Puesto</label>
              <input id="em-puesto" name="puesto" placeholder="Contador" />
            </div>
            <div className="campo">
              <label htmlFor="em-ext">Extensión</label>
              <input id="em-ext" name="extension" placeholder="110" />
            </div>
          </div>
          <BotonEnviar className="boton" ocupado="Guardando…">Guardar empleado</BotonEnviar>
        </form>
      </details>

      {/* Búsqueda y filtros (server, por URL). */}
      <div className="toolbar">
        <form className="filtros" method="get">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre, correo, departamento o puesto…"
            aria-label="Buscar empleados"
          />
          <select name="estado" defaultValue={estado} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="baja">Baja</option>
          </select>
          <select name="depto" defaultValue={depto} aria-label="Filtrar por departamento">
            <option value="">Todos los departamentos</option>
            {departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select name="equipos" defaultValue={equiposFiltro} aria-label="Filtrar por equipos">
            <option value="">Con y sin equipos</option>
            <option value="con">Con equipos</option>
            <option value="sin">Sin equipos</option>
          </select>
          <select name="portal" defaultValue={portal} aria-label="Filtrar por actividad en portal">
            <option value="">Portal: cualquiera</option>
            <option value="con">Con actividad</option>
            <option value="sin">Sin actividad</option>
          </select>
          <button className="boton secundario" type="submit">Filtrar</button>
          {hayFiltro && <Link href="/ti/empleados" className="boton-texto">Limpiar</Link>}
        </form>
      </div>

      {lista.length === 0 ? (
        <div className="vacio">
          <strong>{hayFiltro ? "Sin coincidencias" : "Sin empleados registrados"}</strong>
          {hayFiltro
            ? "Ajusta la búsqueda o limpia los filtros."
            : "Da de alta al primero; con su correo podrá usar el portal y recibir equipos asignados."}
        </div>
      ) : (
        <table className="tabla inv-tabla">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Correo</th>
              <th>Departamento</th>
              <th>Ext.</th>
              <th>Equipos</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const suyos = equiposDe(p.correo);
              return (
                <tr key={p.id}>
                  <td data-label="Empleado">
                    <span className="inv-asignado">
                      <span className="inv-avatar" aria-hidden>{iniciales(p.nombre)}</span>
                      <span>
                        <span className="inv-asignado-nombre">{p.nombre}</span>
                        {p.puesto ? <span className="suave" style={{ fontSize: 12, display: "block" }}>{p.puesto}</span> : null}
                      </span>
                    </span>
                  </td>
                  <td data-label="Correo" className="mono">{p.correo}</td>
                  <td data-label="Departamento" className="suave">{p.departamento ?? "—"}</td>
                  <td data-label="Ext." className="mono">{p.extension ?? "—"}</td>
                  <td data-label="Equipos">
                    {suyos.length === 0 ? (
                      <span className="suave">—</span>
                    ) : (
                      <div className="mini-equipos">
                        {suyos.map((e) => (
                          <span key={e.nombre} className="insignia info" title={ETIQUETA_CAT[e.categoria] ?? e.categoria}>
                            {e.nombre}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td data-label="Estado"><Insignia valor={p.estado} /></td>
                  <td data-label="" className="inv-acciones-celda">
                    <div className="fila-acciones">
                    <Link href={`/ti/empleados/${p.id}/firma`} className="boton secundario mini">Firma</Link>
                    <ModalGestionar
                      titulo={p.nombre}
                      subtitulo={p.puesto || p.departamento || p.correo}
                      resumen={
                        <>
                          <dl className="modal-datos">
                            <div><dt>Correo</dt><dd className="mono">{p.correo}</dd></div>
                            <div><dt>Departamento</dt><dd>{p.departamento ?? "—"}</dd></div>
                            <div><dt>Puesto</dt><dd>{p.puesto ?? "—"}</dd></div>
                            <div><dt>Extensión</dt><dd className="mono">{p.extension ?? "—"}</dd></div>
                            <div><dt>Equipos</dt><dd>{suyos.length || "—"}</dd></div>
                            <div><dt>Portal</dt><dd>{portalActivo.has(p.correo) ? "Con actividad" : "Sin actividad"}</dd></div>
                          </dl>
                          <form action={cambiarEstadoEmpleado} className="inv-gestionar-asignar">
                            <input type="hidden" name="id" value={p.id} />
                            <label className="mini-label">Estado</label>
                            <select name="estado" defaultValue={p.estado}>
                              <option value="activo">activo</option>
                              <option value="baja">baja</option>
                            </select>
                            <BotonEnviar className="boton secundario mini" ocupado="…">Aplicar</BotonEnviar>
                          </form>
                        </>
                      }
                    >
                      <form action={editarEmpleado} className="bloque-form">
                        <input type="hidden" name="id" value={p.id} />
                        <label className="mini-label">Nombre</label>
                        <input name="nombre" defaultValue={p.nombre} required />
                        <label className="mini-label">Correo</label>
                        <input name="correo" type="email" defaultValue={p.correo} required />
                        <label className="mini-label">Departamento</label>
                        <input name="departamento" defaultValue={p.departamento ?? ""} />
                        <label className="mini-label">Puesto</label>
                        <input name="puesto" defaultValue={p.puesto ?? ""} />
                        <label className="mini-label">Extensión</label>
                        <input name="extension" defaultValue={p.extension ?? ""} />
                        <BotonEnviar className="boton mini" ocupado="Guardando…">Guardar cambios</BotonEnviar>
                      </form>

                      <form action={eliminarEmpleado} className="inv-gestionar-eliminar">
                        <input type="hidden" name="id" value={p.id} />
                        <BotonEnviar className="boton-texto" style={{ color: "var(--critico)" }} ocupado="Eliminando…">
                          Eliminar empleado
                        </BotonEnviar>
                      </form>
                    </ModalGestionar>
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

// Iniciales para el avatar: "María López" -> "ML".
function iniciales(s: string): string {
  return s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}
