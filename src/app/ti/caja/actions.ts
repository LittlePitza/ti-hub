"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";
import { todayISO } from "@/lib/domain/invoices";

function revalidate() {
  revalidatePath("/ti/caja");
}

// Form amount to a positive number or null; accepts "1,234.50" (commas stripped).
function amountFromForm(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function recordPurchase(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const concepto = v("concepto");
  const monto = amountFromForm(v("monto"));
  if (!concepto || !monto) return;

  const { error } = await sb.from("caja_movimientos").insert({
    tipo: "compra",
    fecha: v("fecha") ?? todayISO(),
    concepto,
    monto,
    comprador: v("comprador"),
    notas: v("notas"),
  });
  if (error) {
    console.error("[caja] registrar compra:", error.message);
    return;
  }
  revalidate();
}

// Refills the float. The form arrives pre-filled with what is missing to reach
// the limit, but the amount is editable (reimbursements are sometimes partial).
export async function recordReimbursement(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const monto = amountFromForm(v("monto"));
  if (!monto) return;

  const { error } = await sb.from("caja_movimientos").insert({
    tipo: "reembolso",
    fecha: v("fecha") ?? todayISO(),
    concepto: v("concepto") ?? "Reembolso de caja chica",
    monto,
    notas: v("notas"),
  });
  if (error) {
    console.error("[caja] registrar reembolso:", error.message);
    return;
  }
  revalidate();
}

export async function editEntry(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const id = formData.get("id") as string;
  const concepto = v("concepto");
  const monto = amountFromForm(v("monto"));
  const fecha = v("fecha");
  if (!id || !concepto || !monto || !fecha) return;

  const { error } = await sb
    .from("caja_movimientos")
    .update({ concepto, monto, fecha, comprador: v("comprador"), notas: v("notas") })
    .eq("id", id);
  if (error) {
    console.error("[caja] editar movimiento:", error.message);
    return;
  }
  revalidate();
}

export async function deleteEntry(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("caja_movimientos").delete().eq("id", id);
  if (error) {
    console.error("[caja] eliminar movimiento:", error.message);
    return;
  }
  revalidate();
}

// The float limit lives in the single configuration row (config_correo).
export async function saveFundLimit(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const monto = amountFromForm(reader(formData)("caja_limite"));
  if (!monto) return;
  const { error } = await sb.from("config_correo").update({ caja_limite: monto }).eq("id", 1);
  if (error) {
    console.error("[caja] guardar límite:", error.message);
    return;
  }
  revalidate();
}
