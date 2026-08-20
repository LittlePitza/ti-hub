"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";
import { todayISO, CURRENCIES, type Currency } from "@/lib/domain/invoices";
import type { Attachment } from "@/lib/utils/attachments";
import { jsonbList } from "@/lib/utils/jsonb";

function revalidate() {
  revalidatePath("/ti/facturas");
  revalidatePath("/ti");
}

// Form amount to a number or null; accepts "1,234.50" (commas stripped).
function amountFromForm(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function validCurrency(v: string | null): Currency {
  return CURRENCIES.includes(v as Currency) ? (v as Currency) : "MXN";
}

// PDF and XML only (the usual CFDI pair). Supabase enforces the size limit.
function isValidAttachment(f: File): boolean {
  if (f.size === 0) return false;
  const ext = f.name.toLowerCase().split(".").pop();
  return ext === "pdf" || ext === "xml";
}

// Uploads the files from the `adjuntos` input into the `facturas` bucket under
// {id}/… and returns the references. A file that fails is skipped, so it does not
// break the create.
async function uploadAttachments(
  sb: SupabaseClient,
  facturaId: string,
  formData: FormData,
): Promise<Attachment[]> {
  const archivos = formData.getAll("adjuntos").filter((f): f is File => f instanceof File);
  const validos = archivos.filter(isValidAttachment).slice(0, 6);
  const subidos: Attachment[] = [];
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
    subidos.push({
      path,
      nombre: file.name,
      tipo: ext === "pdf" ? "application/pdf" : "application/xml",
    });
  }
  return subidos;
}

export async function createInvoice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
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
      monto: amountFromForm(v("monto")) ?? 0,
      moneda: validCurrency(v("moneda")),
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

  const adjuntos = await uploadAttachments(sb, creada.id, formData);
  if (adjuntos.length) {
    const { error: errAdj } = await sb.from("facturas").update({ adjuntos }).eq("id", creada.id);
    if (errAdj) console.error("[facturas] guardar adjuntos:", errAdj.message);
  }
  revalidate();
}

export async function editInvoice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
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
      monto: amountFromForm(v("monto")) ?? 0,
      moneda: validCurrency(v("moneda")),
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

  // New attachments (optional) are appended to the existing ones.
  const nuevos = await uploadAttachments(sb, id, formData);
  if (nuevos.length) {
    const { data: f } = await sb.from("facturas").select("adjuntos").eq("id", id).maybeSingle();
    const actuales = jsonbList<Attachment>(f?.adjuntos);
    const { error: errAdj } = await sb
      .from("facturas")
      .update({ adjuntos: [...actuales, ...nuevos] })
      .eq("id", id);
    if (errAdj) console.error("[facturas] guardar adjuntos:", errAdj.message);
  }
  revalidate();
}

// Marks the invoice paid and stamps the date (from the form, or today).
export async function markInvoicePaid(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const fecha = reader(formData)("fecha_pago") ?? todayISO();
  const { error } = await sb
    .from("facturas")
    .update({ estado: "pagada", fecha_pago: fecha })
    .eq("id", id);
  if (error) {
    console.error("[facturas] marcar pagada:", error.message);
    return;
  }
  revalidate();
}

export async function cancelInvoice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("facturas").update({ estado: "cancelada" }).eq("id", id);
  if (error) {
    console.error("[facturas] cancelar:", error.message);
    return;
  }
  revalidate();
}

// Returns a paid/cancelled invoice to pending (undoes a misclick).
export async function reopenInvoice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
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
  revalidate();
}

export async function deleteInvoice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;

  // The bucket files first, then the row (same pattern as custody letters).
  const { data: f } = await sb.from("facturas").select("adjuntos").eq("id", id).maybeSingle();
  const adjuntos = jsonbList<Attachment>(f?.adjuntos);
  if (adjuntos.length) {
    await sb.storage.from("facturas").remove(adjuntos.map((a) => a.path));
  }
  const { error } = await sb.from("facturas").delete().eq("id", id);
  if (error) {
    console.error("[facturas] eliminar:", error.message);
    return;
  }
  revalidate();
}

export async function removeAttachment(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  const path = formData.get("path") as string;
  if (!id || !path) return;

  const { data: f } = await sb.from("facturas").select("adjuntos").eq("id", id).maybeSingle();
  const adjuntos = jsonbList<Attachment>(f?.adjuntos);
  await sb.storage.from("facturas").remove([path]);
  const { error } = await sb
    .from("facturas")
    .update({ adjuntos: adjuntos.filter((a) => a.path !== path) })
    .eq("id", id);
  if (error) {
    console.error("[facturas] quitar adjunto:", error.message);
    return;
  }
  revalidate();
}
