import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta } from "@/lib/format";
import { CATEGORIAS_INV, categoriaInv } from "@/lib/inventario";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import { crearEquipo, cambiarEstadoEquipo, asignarEquipo, editarEquipo, eliminarEquipo } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS = ["activo", "en_reparacion", "almacen", "baja"];

export default async function Inventario({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat: catParam } = await searchParams;
  const cat = categoriaInv(catParam);
  const c = cat.campos;

  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Inventario</h1>
        <p className="pagina-desc">Cómputo, celulares, líneas telefónicas y software</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const [equiposQ, empleadosQ] = await Promise.all([
    sb.from("equipos").select("*").order("created_at", { ascending: false }),
    sb.from("empleados").select("nombre, correo").eq("estado", "activo").order("nombre"),
  ]);
  const todos = equiposQ.data ?? [];
  const empleados = empleadosQ.data ?? [];
  const lista = todos.filter((e) => (e.categoria ?? "computo") === cat.valor);

  const selectorEmpleado = (nombre: string, defaultValue?: string) => (
    <select name={nombre} defaultValue={defaultValue ?? ""}>
      <option value="">— Libre / sin asignar —</option>
      {empleados.map((p) => (
        <option key={p.correo} value={p.correo}>{p.nombre}</option>
      ))}
    </select>
  );

  return (
    <>
      {head}

      <nav className="tabs" aria-label="Categorías del inventario">
        {CATEGORIAS_INV.map((t) => {
          const n = todos.filter((e) => (e.categoria ?? "computo") === t.valor).length;
          return (
            <Link
              key={t.valor}
              href={`/ti/inventario?cat=${t.valor}`}
              className={`tab ${t.valor === cat.valor ? "activo" : ""}`}
            >
              {t.etiqueta} <span className="tab-num">{n}</span>
            </Link>
          );
        })}
      </nav>

      <form className="formulario" action={crearEquipo}>
        <h2>Registrar {cat.singular}</h2>
        <input type="hidden" name="categoria" value={cat.valor} />
        <div className="campos">
          <div className="campo">
            <label htmlFor="eq-nombre">{c.nombre.label}</label>
            <input
              id="eq-nombre"
              name="nombre"
              placeholder={c.nombre.placeholder}
              required={cat.valor !== "linea"}
            />
          </div>
          {cat.tipos.length > 1 && (
            <div className="campo">
              <label htmlFor="eq-tipo">Tipo</label>
              <select id="eq-tipo" name="tipo" defaultValue={cat.tipos[0]}>
                {cat.tipos.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
          )}
          {c.marca && (
            <div className="campo">
              <label htmlFor="eq-marca">{c.marca.label}</label>
              <input id="eq-marca" name="marca" placeholder={c.marca.placeholder} />
            </div>
          )}
          {c.modelo && (
            <div className="campo">
              <label htmlFor="eq-modelo">{c.modelo.label}</label>
              <input id="eq-modelo" name="modelo" placeholder={c.modelo.placeholder} />
            </div>
          )}
          {c.num_serie && (
            <div className="campo">
              <label htmlFor="eq-serie">{c.num_serie.label}</label>
              <input id="eq-serie" name="num_serie" placeholder={c.num_serie.placeholder} />
            </div>
          )}
          {c.telefono && (
            <div className="campo">
              <label htmlFor="eq-telefono">{c.telefono.label}</label>
              <input
                id="eq-telefono"
                name="telefono"
                placeholder={c.telefono.placeholder}
                required={cat.valor === "linea"}
              />
            </div>
          )}
          <div className="campo">
            <label htmlFor="eq-empleado">Asignar a</label>
            {selectorEmpleado("empleado")}
          </div>
          {c.ubicacion && (
            <div className="campo">
              <label htmlFor="eq-ubicacion">Ubicación</label>
              <input id="eq-ubicacion" name="ubicacion" placeholder="Planta · Oficina" />
            </div>
          )}
          <div className="campo">
            <label htmlFor="eq-estado">Estado</label>
            <select id="eq-estado" name="estado" defaultValue="activo">
              {ESTADOS.map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}
            </select>
          </div>
          {c.fechas && (
            <>
              <div className="campo">
                <label htmlFor="eq-compra">Fecha de compra</label>
                <input id="eq-compra" name="fecha_compra" type="date" />
              </div>
              <div className="campo">
                <label htmlFor="eq-garantia">{c.garantiaLabel}</label>
                <input id="eq-garantia" name="garantia_hasta" type="date" />
              </div>
            </>
          )}
          <div className="campo ancho">
            <label htmlFor="eq-notas">Notas</label>
            <textarea id="eq-notas" name="notas" placeholder="Detalles, accesorios incluidos, historial…" />
          </div>
        </div>
        <button className="boton" type="submit">Guardar {cat.singular}</button>
      </form>

      {lista.length === 0 ? (
        <div className="vacio">
          <strong>Sin registros en {cat.etiqueta.toLowerCase()}</strong>
          Registra el primero con el formulario de arriba.
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>{cat.valor === "software" ? "Licencia" : "Equipo"}</th>
              {c.num_serie && <th>{c.num_serie.label}</th>}
              {c.telefono && <th>{c.telefono.label}</th>}
              <th>Asignado a</th>
              {c.ubicacion && <th>Ubicación</th>}
              {c.fechas && <th>{c.garantiaLabel}</th>}
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td>
                  <div className="celda-principal">{e.nombre}</div>
                  <div className="suave" style={{ fontSize: 12.5 }}>
                    {[e.marca, e.modelo].filter(Boolean).join(" ") || e.tipo}
                  </div>
                </td>
                {c.num_serie && <td className="mono">{e.num_serie ?? "—"}</td>}
                {c.telefono && <td className="mono">{e.telefono ?? "—"}</td>}
                <td className="suave">
                  {e.asignado_email ? (
                    <>
                      {e.asignado_a}
                      <div style={{ fontSize: 12 }}>{e.asignado_email}</div>
                    </>
                  ) : e.asignado_a ? (
                    e.asignado_a
                  ) : cat.valor === "celular" || cat.valor === "linea" ? (
                    <span className="insignia ok">libre</span>
                  ) : (
                    "—"
                  )}
                </td>
                {c.ubicacion && <td className="suave">{e.ubicacion ?? "—"}</td>}
                {c.fechas && <td className="mono">{fechaCorta(e.garantia_hasta)}</td>}
                <td><Insignia valor={e.estado} /></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div className="fila-acciones">
                    <details className="plegable interno editar">
                      <summary className="boton secundario mini">Editar</summary>
                      <form action={editarEquipo} className="bloque-form panel-editar">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="categoria" value={cat.valor} />
                        <label className="mini-label">{c.nombre.label}</label>
                        <input name="nombre" defaultValue={e.nombre ?? ""} required={cat.valor !== "linea"} />
                        {cat.tipos.length > 1 && (
                          <>
                            <label className="mini-label">Tipo</label>
                            <select name="tipo" defaultValue={e.tipo}>
                              {cat.tipos.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                            </select>
                          </>
                        )}
                        {c.marca && (<><label className="mini-label">{c.marca.label}</label><input name="marca" defaultValue={e.marca ?? ""} /></>)}
                        {c.modelo && (<><label className="mini-label">{c.modelo.label}</label><input name="modelo" defaultValue={e.modelo ?? ""} /></>)}
                        {c.num_serie && (<><label className="mini-label">{c.num_serie.label}</label><input name="num_serie" defaultValue={e.num_serie ?? ""} /></>)}
                        {c.telefono && (<><label className="mini-label">{c.telefono.label}</label><input name="telefono" defaultValue={e.telefono ?? ""} required={cat.valor === "linea"} /></>)}
                        <label className="mini-label">Asignar a</label>
                        {selectorEmpleado("empleado", e.asignado_email ?? "")}
                        {c.ubicacion && (<><label className="mini-label">Ubicación</label><input name="ubicacion" defaultValue={e.ubicacion ?? ""} /></>)}
                        <label className="mini-label">Estado</label>
                        <select name="estado" defaultValue={e.estado}>
                          {ESTADOS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                        {c.fechas && (
                          <div className="dos-col">
                            <div>
                              <label className="mini-label">Compra</label>
                              <input name="fecha_compra" type="date" defaultValue={e.fecha_compra ?? ""} />
                            </div>
                            <div>
                              <label className="mini-label">{c.garantiaLabel}</label>
                              <input name="garantia_hasta" type="date" defaultValue={e.garantia_hasta ?? ""} />
                            </div>
                          </div>
                        )}
                        <label className="mini-label">Notas</label>
                        <textarea name="notas" defaultValue={e.notas ?? ""} rows={2} />
                        <button className="boton mini" type="submit">Guardar</button>
                      </form>
                    </details>
                    <form action={asignarEquipo}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="categoria" value={cat.valor} />
                      {selectorEmpleado("empleado", e.asignado_email ?? "")}
                      <button className="boton secundario mini" type="submit">Asignar</button>
                    </form>
                    <form action={cambiarEstadoEquipo}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="categoria" value={cat.valor} />
                      <select name="estado" defaultValue={e.estado}>
                        {ESTADOS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                      <button className="boton secundario mini" type="submit">Actualizar</button>
                    </form>
                    <form action={eliminarEquipo}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="categoria" value={cat.valor} />
                      <button className="boton secundario mini" type="submit" style={{ color: "var(--critico)" }}>Eliminar</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
