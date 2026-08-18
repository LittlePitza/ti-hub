import { getSupabase } from "@/lib/supabase/client";
import { fechaCorta, moneda } from "@/lib/utils/format";
import { hoyISO } from "@/lib/domain/facturas";
import { resumenCaja, nivelCaja, type MovimientoCaja } from "@/lib/domain/caja";
import SinConexion from "@/components/ui/SinConexion";
import BotonEnviar from "@/components/ui/BotonEnviar";
import {
  registrarCompra,
  registrarReembolso,
  editarMovimiento,
  eliminarMovimiento,
  guardarLimite,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caja chica" };

export default async function CajaChica() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Caja chica</h1>
        <p className="pagina-desc">Control del fondo en efectivo: compras y reembolsos</p>
      </div>
    </div>
  );
  if (!sb)
    return (
      <>
        {head}
        <SinConexion />
      </>
    );

  const [{ data: movs }, { data: config }] = await Promise.all([
    sb
      .from("caja_movimientos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    sb.from("config_correo").select("caja_limite").eq("id", 1).maybeSingle(),
  ]);

  const hoy = hoyISO();
  const movimientos = (movs ?? []) as MovimientoCaja[];
  const r = resumenCaja(movimientos, config?.caja_limite ?? null);
  const nivel = nivelCaja(r);

  // Form del límite: se reusa en el estado sin configurar y en el plegable.
  const formLimite = (
    <form action={guardarLimite} className="bloque-form">
      <label className="mini-label" htmlFor="cj-limite">
        Fondo fijo (MXN)
      </label>
      <input
        id="cj-limite"
        name="caja_limite"
        inputMode="decimal"
        defaultValue={r.limite ?? ""}
        placeholder="5,000.00"
        required
      />
      <BotonEnviar className="boton mini" ocupado="Guardando…">
        Guardar límite
      </BotonEnviar>
    </form>
  );

  const fila = (m: MovimientoCaja) => {
    const esCompra = m.tipo === "compra";
    return (
      <tr key={m.id}>
        <td className="mono">{fechaCorta(m.fecha)}</td>
        <td>
          <div className="celda-principal">{m.concepto}</div>
          {m.notas && (
            <div className="suave" style={{ fontSize: 12.5 }}>
              {m.notas}
            </div>
          )}
        </td>
        <td className="suave">{m.comprador ?? "—"}</td>
        <td>
          <span className={`insignia ${esCompra ? "neutro" : "ok"}`}>
            {esCompra ? "compra" : "reembolso"}
          </span>
        </td>
        <td
          className="mono"
          style={{
            color: esCompra ? undefined : "var(--ok)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {esCompra ? "−" : "+"} {moneda(Number(m.monto))}
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          <div className="fila-acciones">
            <details className="plegable interno editar">
              <summary className="boton secundario mini">Editar</summary>
              <form action={editarMovimiento} className="bloque-form panel-editar">
                <input type="hidden" name="id" value={m.id} />
                <label className="mini-label">Concepto</label>
                <input name="concepto" defaultValue={m.concepto} required />
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Fecha</label>
                    <input name="fecha" type="date" defaultValue={m.fecha} required />
                  </div>
                  <div>
                    <label className="mini-label">Monto</label>
                    <input name="monto" inputMode="decimal" defaultValue={m.monto ?? ""} required />
                  </div>
                </div>
                {esCompra && (
                  <>
                    <label className="mini-label">Quién compró</label>
                    <input name="comprador" defaultValue={m.comprador ?? ""} />
                  </>
                )}
                <label className="mini-label">Notas</label>
                <textarea name="notas" defaultValue={m.notas ?? ""} rows={2} />
                <BotonEnviar className="boton mini" ocupado="Guardando…">
                  Guardar
                </BotonEnviar>
              </form>
            </details>
            <form action={eliminarMovimiento}>
              <input type="hidden" name="id" value={m.id} />
              <BotonEnviar
                className="boton secundario mini"
                style={{ color: "var(--critico)" }}
                ocupado="…"
              >
                Eliminar
              </BotonEnviar>
            </form>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      {head}

      {r.limite === null ? (
        <section className="caja-hero">
          <div className="caja-fondo">
            <span className="eyebrow">Fondo fijo</span>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>
              Configura el fondo de la caja
            </h2>
            <p className="suave" style={{ fontSize: 13.5, marginTop: 4, maxWidth: 480 }}>
              Captura el monto del fondo fijo. A partir de ahí, cada compra baja el saldo y cada
              reembolso lo regresa al límite.
            </p>
          </div>
          <div className="caja-acciones">{formLimite}</div>
        </section>
      ) : (
        <section className="caja-hero">
          <div className="caja-fondo">
            <span className="eyebrow">Disponible en caja</span>
            <div className="caja-saldo">
              {moneda(r.saldo)}
              <span className="de-limite">de {moneda(r.limite)}</span>
            </div>
            <div
              className="caja-barra"
              role="img"
              aria-label={`Queda ${moneda(r.saldo)} de ${moneda(r.limite)}`}
            >
              <div
                className={`caja-barra-fill ${nivel.tono}`}
                style={{ width: `${Math.round(nivel.pct * 100)}%` }}
              />
            </div>
            <div className="caja-extremos">
              <span>$0</span>
              <span>fondo {moneda(r.limite)}</span>
            </div>
            <div className="caja-pie">
              Gastado desde el último reembolso: <b>{moneda(r.gastadoDesdeReembolso)}</b>
              {r.ultimoReembolso && <> · Último reembolso: {fechaCorta(r.ultimoReembolso.fecha)}</>}
            </div>
          </div>
          <div className="caja-acciones">
            <details className="plegable">
              <summary>Registrar reembolso</summary>
              <form action={registrarReembolso} className="bloque-form">
                <label className="mini-label" htmlFor="cj-rmonto">
                  Monto recibido
                </label>
                <input
                  id="cj-rmonto"
                  name="monto"
                  inputMode="decimal"
                  defaultValue={r.porReembolsar > 0 ? r.porReembolsar.toFixed(2) : ""}
                  required
                />
                {r.porReembolsar > 0 && (
                  <p className="suave" style={{ fontSize: 12, margin: "2px 0 0" }}>
                    Faltan {moneda(r.porReembolsar)} para volver al fondo completo.
                  </p>
                )}
                <div className="dos-col">
                  <div>
                    <label className="mini-label" htmlFor="cj-rfecha">
                      Fecha
                    </label>
                    <input id="cj-rfecha" name="fecha" type="date" defaultValue={hoy} required />
                  </div>
                  <div>
                    <label className="mini-label" htmlFor="cj-rconcepto">
                      Concepto
                    </label>
                    <input
                      id="cj-rconcepto"
                      name="concepto"
                      placeholder="Reembolso de caja chica"
                    />
                  </div>
                </div>
                <label className="mini-label" htmlFor="cj-rnotas">
                  Notas
                </label>
                <textarea
                  id="cj-rnotas"
                  name="notas"
                  rows={2}
                  placeholder="Quién lo entregó, referencia…"
                />
                <BotonEnviar className="boton mini" ocupado="Registrando…">
                  Registrar reembolso
                </BotonEnviar>
              </form>
            </details>
            <details className="plegable">
              <summary>Límite del fondo</summary>
              {formLimite}
            </details>
          </div>
        </section>
      )}

      <form className="formulario" action={registrarCompra}>
        <h2>Registrar compra</h2>
        <div className="campos">
          <div className="campo ancho">
            <label htmlFor="cj-concepto">Qué se compró</label>
            <input
              id="cj-concepto"
              name="concepto"
              required
              placeholder="Cable HDMI para sala de juntas"
            />
          </div>
          <div className="campo">
            <label htmlFor="cj-monto">Monto</label>
            <input id="cj-monto" name="monto" inputMode="decimal" required placeholder="350.00" />
          </div>
          <div className="campo">
            <label htmlFor="cj-fecha">Fecha</label>
            <input id="cj-fecha" name="fecha" type="date" defaultValue={hoy} />
          </div>
          <div className="campo">
            <label htmlFor="cj-comprador">Quién compró</label>
            <input id="cj-comprador" name="comprador" placeholder="Lalo" />
          </div>
          <div className="campo ancho">
            <label htmlFor="cj-notas">Notas</label>
            <textarea id="cj-notas" name="notas" placeholder="Ticket, tienda, para qué equipo…" />
          </div>
        </div>
        <BotonEnviar className="boton" ocupado="Registrando…">
          Registrar compra
        </BotonEnviar>
      </form>

      <section className="seccion">
        <h2 className="seccion-titulo">Movimientos</h2>
        {movimientos.length === 0 ? (
          <div className="vacio">
            Sin movimientos. La caja está en su fondo completo; registra la primera compra cuando
            salga efectivo.
          </div>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Quién</th>
                <th>Tipo</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>{movimientos.map(fila)}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
