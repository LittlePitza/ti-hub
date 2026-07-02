"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { lector } from "@/lib/form";
import { hoyISO } from "@/lib/facturas";

function refrescar() {
  revalidatePath("/ti/caja");
}

// Importe del form a número positivo o null; acepta "1,234.50" (quita comas).
function montoDeForm(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function registrarCompra(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const concepto = v("concepto");
  const monto = montoDeForm(v("monto"));
  if (!concepto || !monto) return;

  const { error } = await sb.from("caja_movimientos").insert({
    tipo: "compra",
    fecha: v("fecha") ?? hoyISO(),
    concepto,
    monto,
    comprador: v("comprador"),
    notas: v("notas"),
  });
  if (error) {
    console.error("[caja] registrar compra:", error.message);
    return;
  }
  refrescar();
}

// Rellena el fondo. El form llega prellenado con lo que falta para volver al
// límite, pero el monto es editable (a veces reembolsan parcial).
export async function registrarReembolso(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const monto = montoDeForm(v("monto"));
  if (!monto) return;

  const { error } = await sb.from("caja_movimientos").insert({
    tipo: "reembolso",
    fecha: v("fecha") ?? hoyISO(),
    concepto: v("concepto") ?? "Reembolso de caja chica",
    monto,
    notas: v("notas"),
  });
  if (error) {
    console.error("[caja] registrar reembolso:", error.message);
    return;
  }
  refrescar();
}

export async function editarMovimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  const concepto = v("concepto");
  const monto = montoDeForm(v("monto"));
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
  refrescar();
}

export async function eliminarMovimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("caja_movimientos").delete().eq("id", id);
  if (error) {
    console.error("[caja] eliminar movimiento:", error.message);
    return;
  }
  refrescar();
}

// El límite del fondo vive en la fila única de configuración (config_correo).
export async function guardarLimite(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const monto = montoDeForm(lector(formData)("caja_limite"));
  if (!monto) return;
  const { error } = await sb.from("config_correo").update({ caja_limite: monto }).eq("id", 1);
  if (error) {
    console.error("[caja] guardar límite:", error.message);
    return;
  }
  refrescar();
}
