import { getSupabase } from "@/lib/supabase";
import { fechaCorta } from "@/lib/format";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import { crearEquipo, cambiarEstadoEquipo, eliminarEquipo } from "./actions";

export const dynamic = "force-dynamic";

const TIPOS = ["laptop", "desktop", "monitor", "impresora", "red", "servidor", "perifericos", "otro"];
const ESTADOS = ["activo", "en_reparacion", "almacen", "baja"];

export default async function Inventario() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Inventario</h1>
        <p className="pagina-desc">Equipos del departamento: cómputo, red e impresión</p>
      </div>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data: equipos } = await sb.from("equipos").select("*").order("created_at", { ascending: false });

  return (
    <>
      {head}

      <form className="formulario" action={crearEquipo}>
        <h2>Registrar equipo</h2>
        <div className="campos">
          <div className="campo">
            <label htmlFor="eq-nombre">Nombre / etiqueta</label>
            <input id="eq-nombre" name="nombre" required placeholder="LAP-EDICION-02" />
          </div>
          <div className="campo">
            <label htmlFor="eq-tipo">Tipo</label>
            <select id="eq-tipo" name="tipo" defaultValue="laptop">
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="eq-marca">Marca</label>
            <input id="eq-marca" name="marca" placeholder="Dell" />
          </div>
          <div className="campo">
            <label htmlFor="eq-modelo">Modelo</label>
            <input id="eq-modelo" name="modelo" placeholder="Precision 5680" />
          </div>
          <div className="campo">
            <label htmlFor="eq-serie">Número de serie</label>
            <input id="eq-serie" name="num_serie" placeholder="DLP5680-0001" />
          </div>
          <div className="campo">
            <label htmlFor="eq-asignado">Asignado a</label>
            <input id="eq-asignado" name="asignado_a" placeholder="Persona o área" />
          </div>
          <div className="campo">
            <label htmlFor="eq-ubicacion">Ubicación</label>
            <input id="eq-ubicacion" name="ubicacion" placeholder="Oficina · Piso 2" />
          </div>
          <div className="campo">
            <label htmlFor="eq-estado">Estado</label>
            <select id="eq-estado" name="estado" defaultValue="activo">
              {ESTADOS.map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="eq-compra">Fecha de compra</label>
            <input id="eq-compra" name="fecha_compra" type="date" />
          </div>
          <div className="campo">
            <label htmlFor="eq-garantia">Garantía hasta</label>
            <input id="eq-garantia" name="garantia_hasta" type="date" />
          </div>
          <div className="campo ancho">
            <label htmlFor="eq-notas">Notas</label>
            <textarea id="eq-notas" name="notas" placeholder="Detalles, accesorios incluidos, historial…" />
          </div>
        </div>
        <button className="boton" type="submit">Guardar equipo</button>
      </form>

      {(equipos ?? []).length === 0 ? (
        <div className="vacio"><strong>Inventario vacío</strong>Registra el primer equipo con el formulario de arriba.</div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Equipo</th><th>No. serie</th><th>Asignado a</th><th>Ubicación</th>
              <th>Garantía</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(equipos ?? []).map((e) => (
              <tr key={e.id}>
                <td>
                  <div className="celda-principal">{e.nombre}</div>
                  <div className="suave" style={{ fontSize: 12.5 }}>
                    {[e.marca, e.modelo].filter(Boolean).join(" ") || e.tipo}
                  </div>
                </td>
                <td className="mono">{e.num_serie ?? "—"}</td>
                <td className="suave">{e.asignado_a ?? "—"}</td>
                <td className="suave">{e.ubicacion ?? "—"}</td>
                <td className="mono">{fechaCorta(e.garantia_hasta)}</td>
                <td><Insignia valor={e.estado} /></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <form action={cambiarEstadoEquipo} style={{ display: "inline-flex", gap: 6 }}>
                    <input type="hidden" name="id" value={e.id} />
                    <select name="estado" defaultValue={e.estado} style={{ border: "1px solid var(--linea-fuerte)", borderRadius: 5, padding: "3px 6px", fontSize: 12.5 }}>
                      {ESTADOS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                    <button className="boton secundario mini" type="submit">Actualizar</button>
                  </form>{" "}
                  <form action={eliminarEquipo} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="boton secundario mini" type="submit" style={{ color: "var(--critico)" }}>Eliminar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
