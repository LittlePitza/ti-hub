import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, moneda } from "@/lib/format";
import { MONEDAS, PERIODICIDADES, etiquetaPeriodicidad, hoyISO } from "@/lib/facturas";
import SinConexion from "@/components/SinConexion";
import BotonEnviar from "@/components/BotonEnviar";
import {
  crearProveedor,
  editarProveedor,
  alternarActivo,
  eliminarProveedor,
  registrarPagoProveedor,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proveedores" };

export default async function Proveedores() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Proveedores</h1>
        <p className="pagina-desc">Servicios contratados y sus pagos recurrentes</p>
      </div>
      <Link href="/ti/facturas" className="boton secundario">Facturas</Link>
    </div>
  );
  if (!sb) return <>{head}<SinConexion /></>;

  const { data: proveedores } = await sb.from("proveedores").select("*").order("nombre");
  const hoy = hoyISO();
  const lista = proveedores ?? [];

  const fila = (p: any) => {
    const vencido = p.activo && p.proximo_pago && p.proximo_pago < hoy;
    return (
      <tr key={p.id}>
        <td>
          <div className="celda-principal">{p.nombre}</div>
          {p.servicio && <div className="suave" style={{ fontSize: 12.5 }}>{p.servicio}</div>}
        </td>
        <td className="suave">
          {p.contacto ?? "—"}
          {(p.telefono || p.correo) && (
            <div style={{ fontSize: 12.5 }}>{[p.telefono, p.correo].filter(Boolean).join(" · ")}</div>
          )}
        </td>
        <td className="mono">
          {p.costo === null ? "variable" : moneda(Number(p.costo), p.moneda === "USD" ? "USD" : "MXN")}
        </td>
        <td className="suave">{etiquetaPeriodicidad(p.periodicidad)}</td>
        <td className="mono" style={vencido ? { color: "var(--critico)", fontWeight: 600 } : undefined}>
          {p.proximo_pago ? `${fechaCorta(p.proximo_pago)}${vencido ? " ·!" : ""}` : "—"}
        </td>
        <td><span className={`insignia ${p.activo ? "ok" : "neutro"}`}>{p.activo ? "activo" : "inactivo"}</span></td>
        <td style={{ whiteSpace: "nowrap" }}>
          <div className="fila-acciones">
            {p.activo && p.proximo_pago && (
              <form action={registrarPagoProveedor}>
                <input type="hidden" name="id" value={p.id} />
                <BotonEnviar className="boton mini" ocupado="…">Registrar pago</BotonEnviar>
              </form>
            )}
            <details className="plegable interno editar">
              <summary className="boton secundario mini">Editar</summary>
              <form action={editarProveedor} className="bloque-form panel-editar">
                <input type="hidden" name="id" value={p.id} />
                <label className="mini-label">Nombre</label>
                <input name="nombre" defaultValue={p.nombre} required />
                <label className="mini-label">Servicio</label>
                <input name="servicio" defaultValue={p.servicio ?? ""} />
                <label className="mini-label">Contacto</label>
                <input name="contacto" defaultValue={p.contacto ?? ""} />
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Teléfono</label>
                    <input name="telefono" defaultValue={p.telefono ?? ""} />
                  </div>
                  <div>
                    <label className="mini-label">Correo</label>
                    <input name="correo" type="email" defaultValue={p.correo ?? ""} />
                  </div>
                </div>
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Costo por periodo</label>
                    <input name="costo" inputMode="decimal" defaultValue={p.costo ?? ""} placeholder="vacío = variable" />
                  </div>
                  <div>
                    <label className="mini-label">Moneda</label>
                    <select name="moneda" defaultValue={p.moneda}>
                      {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Periodicidad</label>
                    <select name="periodicidad" defaultValue={p.periodicidad}>
                      {PERIODICIDADES.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mini-label">Próximo pago</label>
                    <input name="proximo_pago" type="date" defaultValue={p.proximo_pago ?? ""} />
                  </div>
                </div>
                <label className="mini-label">Notas</label>
                <textarea name="notas" defaultValue={p.notas ?? ""} rows={2} />
                <BotonEnviar className="boton mini" ocupado="Guardando…">Guardar</BotonEnviar>
              </form>
            </details>
            <form action={alternarActivo}>
              <input type="hidden" name="id" value={p.id} />
              <BotonEnviar className="boton secundario mini" ocupado="…">{p.activo ? "Desactivar" : "Activar"}</BotonEnviar>
            </form>
            <form action={eliminarProveedor}>
              <input type="hidden" name="id" value={p.id} />
              <BotonEnviar className="boton secundario mini" style={{ color: "var(--critico)" }} ocupado="…">Eliminar</BotonEnviar>
            </form>
          </div>
        </td>
      </tr>
    );
  };

  const activos = lista.filter((p) => p.activo);
  const inactivos = lista.filter((p) => !p.activo);
  const encabezados = (
    <tr><th>Proveedor</th><th>Contacto</th><th>Costo</th><th>Periodicidad</th><th>Próximo pago</th><th>Estado</th><th></th></tr>
  );

  return (
    <>
      {head}

      <form className="formulario" action={crearProveedor}>
        <h2>Dar de alta proveedor</h2>
        <div className="campos">
          <div className="campo">
            <label htmlFor="pv-nombre">Nombre</label>
            <input id="pv-nombre" name="nombre" required placeholder="Microsoft" />
          </div>
          <div className="campo">
            <label htmlFor="pv-servicio">Servicio</label>
            <input id="pv-servicio" name="servicio" placeholder="Licencias Microsoft 365" />
          </div>
          <div className="campo">
            <label htmlFor="pv-contacto">Contacto</label>
            <input id="pv-contacto" name="contacto" placeholder="Ejecutivo de cuenta" />
          </div>
          <div className="campo">
            <label htmlFor="pv-telefono">Teléfono</label>
            <input id="pv-telefono" name="telefono" placeholder="81 0000 0000" />
          </div>
          <div className="campo">
            <label htmlFor="pv-correo">Correo</label>
            <input id="pv-correo" name="correo" type="email" placeholder="soporte@proveedor.com" />
          </div>
          <div className="campo">
            <label htmlFor="pv-costo">Costo por periodo</label>
            <input id="pv-costo" name="costo" inputMode="decimal" placeholder="vacío = variable" />
          </div>
          <div className="campo">
            <label htmlFor="pv-moneda">Moneda</label>
            <select id="pv-moneda" name="moneda" defaultValue="MXN">
              {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="pv-periodicidad">Periodicidad</label>
            <select id="pv-periodicidad" name="periodicidad" defaultValue="mensual">
              {PERIODICIDADES.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="pv-proximo">Próximo pago</label>
            <input id="pv-proximo" name="proximo_pago" type="date" />
          </div>
          <div className="campo ancho">
            <label htmlFor="pv-notas">Notas</label>
            <textarea id="pv-notas" name="notas" placeholder="Número de contrato, condiciones…" />
          </div>
        </div>
        <BotonEnviar className="boton" ocupado="Guardando…">Dar de alta</BotonEnviar>
      </form>

      <section className="seccion">
        <h2 className="seccion-titulo">Activos</h2>
        {activos.length === 0 ? (
          <div className="vacio">Sin proveedores registrados. Da de alta los servicios que paga el departamento.</div>
        ) : (
          <table className="tabla">
            <thead>{encabezados}</thead>
            <tbody>{activos.map(fila)}</tbody>
          </table>
        )}
      </section>

      {inactivos.length > 0 && (
        <section className="seccion">
          <h2 className="seccion-titulo">Inactivos</h2>
          <table className="tabla">
            <thead>{encabezados}</thead>
            <tbody>{inactivos.map(fila)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}
