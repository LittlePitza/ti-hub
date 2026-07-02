"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { lector } from "@/lib/form";
import { hoyISO, MONEDAS, type Moneda } from "@/lib/facturas";
import type { Adjunto } from "@/lib/adjuntos";

function refrescar() {
  revalidatePath("/ti/facturas");
  revalidatePath("/ti");
}

// Importe del form a número o null; acepta "1,234.50" (quita comas).
function montoDeForm(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function monedaValida(v: string | null): Moneda {
  return MONEDAS.includes(v as Moneda) ? (v as Moneda) : "MXN";
}

// Solo PDF y XML (el par típico del CFDI). El tamaño lo limita Supabase.
function esAdjuntoValido(f: File): boolean {
  if (f.size === 0) return false;
  const ext = f.name.toLowerCase().split(".").pop();
  return ext === "pdf" || ext === "xml";
}

// Sube los archivos del input `adjuntos` al bucket `facturas` bajo {id}/… y
// devuelve las referencias. Un archivo que falle se omite (no rompe el alta).
async function subirAdjuntos(sb: SupabaseClient, facturaId: string, formData: FormData): Promise<Adjunto[]> {
  const archivos = formData.getAll("adjuntos").filter((f): f is File => f instanceof File);
  const validos = archivos.filter(esAdjuntoValido).slice(0, 6);
  const subidos: Adjunto[] = [];
  for (const [i, file] of validos.entries()) {
    const ext = file.name.toLowerCase().split(".").pop();
    const path = `${facturaId}/${Date.now()}-${i}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage.from("facturas").upload(path, buffer, {
      contentType: ext === "pdf" ? "application/pdf" : "application/xml",
    });
    if (error) {
      console.error("[facturas] subir adjunto:", error.message);
      continue;
    }
    subidos.push({ path, nombre: file.name, tipo: ext === "pdf" ? "application/pdf" : "application/xml" });
  }
  return subidos;
}

export async function crearFactura(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const concepto = v("concepto");
  const vencimiento = v("fecha_vencimiento");
  if (!concepto || !vencimiento) return;

  const { data: creada, error } = await sb
    .from("facturas")
    .insert({
      concepto,
      proveedor_id: v("proveedor_id"),
      folio_proveedor: v("folio_proveedor"),
      uuid_cfdi: v("uuid_cfdi"),
      monto: montoDeForm(v("monto")) ?? 0,
      moneda: monedaValida(v("moneda")),
      fecha_emision: v("fecha_emision"),
      fecha_vencimiento: vencimiento,
      metodo_pago: v("metodo_pago"),
      notas: v("notas"),
    })
    .select("id")
    .single();
  if (error || !creada) {
    console.error("[facturas] crear:", error?.message);
    return;
  }

  const adjuntos = await subirAdjuntos(sb, creada.id, formData);
  if (adjuntos.length) {
    const { error: errAdj } = await sb.from("facturas").update({ adjuntos }).eq("id", creada.id);
    if (errAdj) console.error("[facturas] guardar adjuntos:", errAdj.message);
  }
  refrescar();
}

export async function editarFactura(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  const concepto = v("concepto");
  const vencimiento = v("fecha_vencimiento");
  if (!id || !concepto || !vencimiento) return;

  const { error } = await sb
    .from("facturas")
    .update({
      concepto,
      proveedor_id: v("proveedor_id"),
      folio_proveedor: v("folio_proveedor"),
      uuid_cfdi: v("uuid_cfdi"),
      monto: montoDeForm(v("monto")) ?? 0,
      moneda: monedaValida(v("moneda")),
      fecha_emision: v("fecha_emision"),
      fecha_vencimiento: vencimiento,
      metodo_pago: v("metodo_pago"),
      notas: v("notas"),
    })
    .eq("id", id);
  if (error) {
    console.error("[facturas] editar:", error.message);
    return;
  }

  // Adjuntos nuevos (opcionales) se agregan a los existentes.
  const nuevos = await subirAdjuntos(sb, id, formData);
  if (nuevos.length) {
    const { data: f } = await sb.from("facturas").select("adjuntos").eq("id", id).maybeSingle();
    const actuales: Adjunto[] = Array.isArray(f?.adjuntos) ? f.adjuntos : [];
    const { error: errAdj } = await sb.from("facturas").update({ adjuntos: [...actuales, ...nuevos] }).eq("id", id);
    if (errAdj) console.error("[facturas] guardar adjuntos:", errAdj.message);
  }
  refrescar();
}

// Marca la factura pagada y sella la fecha (la del form o hoy).
export async function marcarPagada(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const fecha = lector(formData)("fecha_pago") ?? hoyISO();
  const { error } = await sb
    .from("facturas")
    .update({ estado: "pagada", fecha_pago: fecha })
    .eq("id", id);
  if (error) {
    console.error("[facturas] marcar pagada:", error.message);
    return;
  }
  refrescar();
}

export async function cancelarFactura(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("facturas").update({ estado: "cancelada" }).eq("id", id);
  if (error) {
    console.error("[facturas] cancelar:", error.message);
    return;
  }
  refrescar();
}

// Regresa una pagada/cancelada a pendiente (deshace un clic equivocado).
export async function reabrirFactura(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb
    .from("facturas")
    .update({ estado: "pendiente", fecha_pago: null })
    .eq("id", id);
  if (error) {
    console.error("[facturas] reabrir:", error.message);
    return;
  }
  refrescar();
}

export async function eliminarFactura(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;

  // Primero los archivos del bucket, luego la fila (patrón de responsivas).
  const { data: f } = await sb.from("facturas").select("adjuntos").eq("id", id).maybeSingle();
  const adjuntos: Adjunto[] = Array.isArray(f?.adjuntos) ? f.adjuntos : [];
  if (adjuntos.length) {
    await sb.storage.from("facturas").remove(adjuntos.map((a) => a.path));
  }
  const { error } = await sb.from("facturas").delete().eq("id", id);
  if (error) {
    console.error("[facturas] eliminar:", error.message);
    return;
  }
  refrescar();
}

export async function quitarAdjunto(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const path = formData.get("path") as string;
  if (!id || !path) return;

  const { data: f } = await sb.from("facturas").select("adjuntos").eq("id", id).maybeSingle();
  const adjuntos: Adjunto[] = Array.isArray(f?.adjuntos) ? f.adjuntos : [];
  await sb.storage.from("facturas").remove([path]);
  const { error } = await sb
    .from("facturas")
    .update({ adjuntos: adjuntos.filter((a) => a.path !== path) })
    .eq("id", id);
  if (error) {
    console.error("[facturas] quitar adjunto:", error.message);
    return;
  }
  refrescar();
}
