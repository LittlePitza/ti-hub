import { getSupabase } from "@/lib/supabase";
import { CATEGORIAS_INV } from "@/lib/inventario";
import Insignia from "@/components/Insignia";
import SinConexion from "@/components/SinConexion";
import { crearEmpleado, cambiarEstadoEmpleado, eliminarEmpleado } from "./actions";

export const dynamic = "force-dynamic";

const ETIQUETA_CAT: Record<string, string> = Object.fromEntries(
  CATEGORIAS_INV.map((c) => [c.valor, c.singular]),
);

export default async function Empleados() {
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

  const [empleadosQ, equiposQ] = await Promise.all([
    sb.from("empleados").select("*").order("nombre"),
    sb.from("equipos")
      .select("nombre, categoria, asignado_email")
      .not("asignado_email", "is", null)
      .neq("estado", "baja"),
  ]);
  const empleados = empleadosQ.data ?? [];
  const equipos = equiposQ.data ?? [];

  const equiposDe = (correo: string) => equipos.filter((e) => e.asignado_email === correo);

  return (
    <>
      {head}

      <form className="formulario" action={crearEmpleado}>
        <h2>Dar de alta empleado</h2>
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
        <button className="boton" type="submit">Guardar empleado</button>
      </form>

      {empleados.length === 0 ? (
        <div className="vacio">
          <strong>Sin empleados registrados</strong>
          Da de alta al primero; con su correo podrá usar el portal y recibir equipos asignados.
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Empleado</th><th>Correo</th><th>Departamento</th><th>Ext.</th>
              <th>Equipos asignados</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {empleados.map((p) => {
              const suyos = equiposDe(p.correo);
              return (
                <tr key={p.id}>
                  <td>
                    <div className="celda-principal">{p.nombre}</div>
                    {p.puesto && <div className="suave" style={{ fontSize: 12.5 }}>{p.puesto}</div>}
                  </td>
                  <td className="mono">{p.correo}</td>
                  <td className="suave">{p.departamento ?? "—"}</td>
                  <td className="mono">{p.extension ?? "—"}</td>
                  <td>
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
                  <td><Insignia valor={p.estado} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div className="fila-acciones">
                      <form action={cambiarEstadoEmpleado}>
                        <input type="hidden" name="id" value={p.id} />
                        <select name="estado" defaultValue={p.estado}>
                          <option value="activo">activo</option>
                          <option value="baja">baja</option>
                        </select>
                        <button className="boton secundario mini" type="submit">Actualizar</button>
                      </form>
                      <form action={eliminarEmpleado}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="boton secundario mini" type="submit" style={{ color: "var(--critico)" }}>Eliminar</button>
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
