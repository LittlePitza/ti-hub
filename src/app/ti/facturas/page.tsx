import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { shortDate, invoiceFolio, currency } from "@/lib/utils/format";
import {
  CURRENCIES,
  todayISO,
  visibleInvoiceStatus,
  paymentSchedule,
  groupByMonth,
  monthOutstanding,
  formatTotals,
  type Currency,
} from "@/lib/domain/invoices";
import type { Attachment } from "@/lib/utils/attachments";
import NoConnection from "@/components/ui/NoConnection";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  createInvoice,
  editInvoice,
  markInvoicePaid,
  cancelInvoice,
  reopenInvoice,
  deleteInvoice,
  removeAttachment,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas" };

export default async function Facturas() {
  const sb = await getSupabase();
  const head = (
    <div className="pagina-head">
      <div>
        <h1 className="pagina-titulo">Facturas</h1>
        <p className="pagina-desc">Aviso y registro interno de pagos — lo fiscal se lleva en SAP</p>
      </div>
      <Link href="/ti/facturas/proveedores" className="boton secundario">
        Proveedores
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

  const [{ data: facturas }, { data: proveedores }] = await Promise.all([
    sb
      .from("facturas")
      .select("*, proveedores(nombre)")
      .order("fecha_vencimiento", { ascending: true }),
    sb.from("proveedores").select("*").order("nombre"),
  ]);

  const hoy = todayISO();
  const lista = facturas ?? [];
  const provs = proveedores ?? [];
  const provsActivos = provs.filter((p) => p.activo);

  // Agenda: pending invoices plus vendor projections (90 days).
  const calendario = paymentSchedule(lista, provs, hoy);
  const agenda = groupByMonth(calendario);

  // Metrics
  const pendienteMes = monthOutstanding(calendario, hoy);
  const vencidas = lista.filter((f) => visibleInvoiceStatus(f, hoy).value === "vencida").length;
  const pagadoMes: Record<Currency, number> = { MXN: 0, USD: 0 };
  for (const f of lista) {
    if (f.estado === "pagada" && f.fecha_pago?.slice(0, 7) === hoy.slice(0, 7)) {
      pagadoMes[(f.moneda === "USD" ? "USD" : "MXN") as Currency] += Number(f.monto);
    }
  }

  // The bucket is private: one signed URL per attachment (same recipe as tickets).
  const firmados = new Map<string, string>();
  await Promise.all(
    lista
      .flatMap((f) => (Array.isArray(f.adjuntos) ? (f.adjuntos as Attachment[]) : []))
      .map(async (a) => {
        const { data } = await sb.storage.from("facturas").createSignedUrl(a.path, 3600);
        if (data?.signedUrl) firmados.set(a.path, data.signedUrl);
      }),
  );

  const activas = lista.filter((f) => f.estado === "pendiente");
  const historial = lista
    .filter((f) => f.estado !== "pendiente")
    .sort((a, b) =>
      (b.fecha_pago ?? b.fecha_vencimiento).localeCompare(a.fecha_pago ?? a.fecha_vencimiento),
    );

  const fila = (f: any) => {
    const est = visibleInvoiceStatus(f, hoy);
    const adjuntos: Attachment[] = Array.isArray(f.adjuntos) ? f.adjuntos : [];
    return (
      <tr key={f.id}>
        <td className="mono">{invoiceFolio(f.num)}</td>
        <td>
          <div className="celda-principal">{f.concepto}</div>
          {adjuntos.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {adjuntos.map((a) => {
                const url = firmados.get(a.path);
                return url ? (
                  <a
                    key={a.path}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="resguardo-chip info"
                  >
                    <span className="punto" />
                    {a.nombre}
                  </a>
                ) : null;
              })}
            </div>
          )}
        </td>
        <td className="suave">{f.proveedores?.nombre ?? "—"}</td>
        <td className="mono">{currency(Number(f.monto), f.moneda === "USD" ? "USD" : "MXN")}</td>
        <td
          className="mono"
          style={est.value === "vencida" ? { color: "var(--critico)", fontWeight: 600 } : undefined}
        >
          {shortDate(f.fecha_vencimiento)}
        </td>
        <td className="suave">{f.estado === "pagada" ? shortDate(f.fecha_pago) : "—"}</td>
        <td>
          <span className={`insignia ${est.tone}`}>{est.label}</span>
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          <div className="fila-acciones">
            <details className="plegable interno editar">
              <summary className="boton secundario mini">Editar</summary>
              <form action={editInvoice} className="bloque-form panel-editar">
                <input type="hidden" name="id" value={f.id} />
                <label className="mini-label">Concepto</label>
                <input name="concepto" defaultValue={f.concepto} required />
                <label className="mini-label">Proveedor</label>
                <select name="proveedor_id" defaultValue={f.proveedor_id ?? ""}>
                  <option value="">— Sin proveedor —</option>
                  {provs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Monto</label>
                    <input name="monto" inputMode="decimal" defaultValue={f.monto ?? ""} />
                  </div>
                  <div>
                    <label className="mini-label">Moneda</label>
                    <select name="moneda" defaultValue={f.moneda}>
                      {CURRENCIES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Emisión</label>
                    <input name="fecha_emision" type="date" defaultValue={f.fecha_emision ?? ""} />
                  </div>
                  <div>
                    <label className="mini-label">Vencimiento</label>
                    <input
                      name="fecha_vencimiento"
                      type="date"
                      defaultValue={f.fecha_vencimiento}
                      required
                    />
                  </div>
                </div>
                <div className="dos-col">
                  <div>
                    <label className="mini-label">Folio del proveedor</label>
                    <input name="folio_proveedor" defaultValue={f.folio_proveedor ?? ""} />
                  </div>
                  <div>
                    <label className="mini-label">Método de pago</label>
                    <input
                      name="metodo_pago"
                      defaultValue={f.metodo_pago ?? ""}
                      placeholder="Transferencia"
                    />
                  </div>
                </div>
                <label className="mini-label">UUID del CFDI</label>
                <input name="uuid_cfdi" defaultValue={f.uuid_cfdi ?? ""} />
                <label className="mini-label">Notas</label>
                <textarea name="notas" defaultValue={f.notas ?? ""} rows={2} />
                <label className="mini-label">Agregar adjuntos (PDF/XML)</label>
                <input name="adjuntos" type="file" accept=".pdf,.xml" multiple />
                <SubmitButton className="boton mini" ocupado="Guardando…">
                  Guardar
                </SubmitButton>
              </form>
            </details>
            {adjuntos.length > 0 && (
              <details className="plegable interno">
                <summary className="boton secundario mini">Adjuntos</summary>
                <div className="bloque-form panel-editar">
                  {adjuntos.map((a) => (
                    <form
                      action={removeAttachment}
                      key={a.path}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="path" value={a.path} />
                      <span
                        className="suave"
                        style={{
                          fontSize: 12.5,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.nombre}
                      </span>
                      <SubmitButton
                        className="boton secundario mini"
                        style={{ color: "var(--critico)" }}
                        ocupado="…"
                      >
                        Quitar
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </details>
            )}
            {f.estado === "pendiente" ? (
              <>
                <form action={markInvoicePaid}>
                  <input type="hidden" name="id" value={f.id} />
                  <input
                    name="fecha_pago"
                    type="date"
                    defaultValue={hoy}
                    aria-label="Fecha de pago"
                  />
                  <SubmitButton className="boton mini" ocupado="…">
                    Pagada
                  </SubmitButton>
                </form>
                <form action={cancelInvoice}>
                  <input type="hidden" name="id" value={f.id} />
                  <SubmitButton className="boton secundario mini" ocupado="…">
                    Cancelar
                  </SubmitButton>
                </form>
              </>
            ) : (
              <form action={reopenInvoice}>
                <input type="hidden" name="id" value={f.id} />
                <SubmitButton className="boton secundario mini" ocupado="…">
                  Reabrir
                </SubmitButton>
              </form>
            )}
            <form action={deleteInvoice}>
              <input type="hidden" name="id" value={f.id} />
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
  };

  const encabezados = (
    <tr>
      <th>Folio</th>
      <th>Concepto</th>
      <th>Proveedor</th>
      <th>Monto</th>
      <th>Vence</th>
      <th>Pagada</th>
      <th>Estado</th>
      <th></th>
    </tr>
  );

  return (
    <>
      {head}

      <div className="metricas">
        <div className="metrica">
          <div className="metrica-valor">{formatTotals(pendienteMes)}</div>
          <div className="metrica-label">Pendiente del mes</div>
        </div>
        <div className="metrica">
          <div className={`metrica-valor ${vencidas > 0 ? "alerta" : ""}`}>{vencidas}</div>
          <div className="metrica-label">Facturas vencidas</div>
        </div>
        <div className="metrica">
          <div className="metrica-valor">{formatTotals(pagadoMes)}</div>
          <div className="metrica-label">Pagado este mes</div>
        </div>
      </div>

      <form className="formulario" action={createInvoice}>
        <h2>Capturar factura</h2>
        <div className="campos">
          <div className="campo ancho">
            <label htmlFor="fc-concepto">Concepto</label>
            <input
              id="fc-concepto"
              name="concepto"
              required
              placeholder="Internet dedicado · julio 2026"
            />
          </div>
          <div className="campo">
            <label htmlFor="fc-proveedor">Proveedor (opcional)</label>
            <select id="fc-proveedor" name="proveedor_id" defaultValue="">
              <option value="">— Sin proveedor —</option>
              {provsActivos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fc-monto">Monto</label>
            <input id="fc-monto" name="monto" inputMode="decimal" placeholder="4,890.00" />
          </div>
          <div className="campo">
            <label htmlFor="fc-moneda">Moneda</label>
            <select id="fc-moneda" name="moneda" defaultValue="MXN">
              {CURRENCIES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fc-emision">Fecha de emisión</label>
            <input id="fc-emision" name="fecha_emision" type="date" />
          </div>
          <div className="campo">
            <label htmlFor="fc-vence">Fecha de vencimiento</label>
            <input id="fc-vence" name="fecha_vencimiento" type="date" required />
          </div>
          <div className="campo">
            <label htmlFor="fc-folio">Folio del proveedor</label>
            <input id="fc-folio" name="folio_proveedor" placeholder="A-12345" />
          </div>
          <div className="campo">
            <label htmlFor="fc-uuid">UUID del CFDI</label>
            <input id="fc-uuid" name="uuid_cfdi" placeholder="ad662d33-…" />
          </div>
          <div className="campo">
            <label htmlFor="fc-metodo">Método de pago</label>
            <input id="fc-metodo" name="metodo_pago" placeholder="Transferencia" />
          </div>
          <div className="campo ancho">
            <label htmlFor="fc-adjuntos">Adjuntos (PDF/XML)</label>
            <input id="fc-adjuntos" name="adjuntos" type="file" accept=".pdf,.xml" multiple />
          </div>
          <div className="campo ancho">
            <label htmlFor="fc-notas">Notas</label>
            <textarea id="fc-notas" name="notas" placeholder="Referencia bancaria, aclaraciones…" />
          </div>
        </div>
        <SubmitButton className="boton" ocupado="Guardando…">
          Capturar
        </SubmitButton>
      </form>

      <section className="seccion">
        <h2 className="seccion-titulo">Agenda de pagos · próximos 90 días</h2>
        {agenda.length === 0 ? (
          <div className="vacio">
            Sin pagos en el horizonte. Captura facturas o define el próximo pago de tus proveedores.
          </div>
        ) : (
          agenda.map((mes) => (
            <div className="tarjeta" key={mes.clave} style={{ marginBottom: 14 }}>
              <div className="panel-cab" style={{ padding: 0, marginBottom: 8 }}>
                <span className="panel-cab-titulo">{mes.label}</span>
                <span className="mono suave">{formatTotals(mes.total)}</span>
              </div>
              {mes.items.map((v, i) => (
                <div className="fila-compacta" key={`${v.refId}-${v.fecha}-${i}`}>
                  <div className="fila-compacta-main">
                    <div className="fila-compacta-titulo">{v.titulo}</div>
                    <div className="fila-compacta-sub">
                      <span className={`insignia ${v.origen === "factura" ? "info" : "neutro"}`}>
                        {v.origen === "factura" ? "factura" : "recurrente"}
                      </span>
                      {v.vencido && <span className="insignia critico">vencido</span>}
                    </div>
                  </div>
                  <div className="fila-compacta-fin">
                    <div className={`fila-compacta-fecha ${v.vencido ? "fecha-vencida" : ""}`}>
                      {shortDate(v.fecha)}
                    </div>
                    <div className="mono suave" style={{ fontSize: 12 }}>
                      {v.monto === null ? "variable" : currency(v.monto, v.moneda)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo">Pendientes de pago</h2>
        {activas.length === 0 ? (
          <div className="vacio">Sin facturas pendientes.</div>
        ) : (
          <table className="tabla">
            <thead>{encabezados}</thead>
            <tbody>{activas.map(fila)}</tbody>
          </table>
        )}
      </section>

      {historial.length > 0 && (
        <details className="plegable">
          <summary>
            Historial · {historial.length} {historial.length === 1 ? "factura" : "facturas"}
          </summary>
          <div style={{ padding: "0 16px 16px" }}>
            <table className="tabla">
              <thead>{encabezados}</thead>
              <tbody>{historial.map(fila)}</tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
