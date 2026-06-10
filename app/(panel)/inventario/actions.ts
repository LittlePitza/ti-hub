"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";

export async function crearEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  await sb.from("equipos").insert({
    nombre: v("nombre"),
    tipo: v("tipo"),
    marca: v("marca"),
    modelo: v("modelo"),
    num_serie: v("num_serie"),
    asignado_a: v("asignado_a"),
    asignado_email: v("asignado_email")?.toLowerCase() ?? null,
    ubicacion: v("ubicacion"),
    estado: v("estado"),
    fecha_compra: v("fecha_compra"),
    garantia_hasta: v("garantia_hasta"),
    notas: v("notas"),
  });
  revalidatePath("/inventario");
  revalidatePath("/");
}

export async function cambiarEstadoEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("equipos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  revalidatePath("/inventario");
  revalidatePath("/");
}

export async function eliminarEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("equipos").delete().eq("id", formData.get("id") as string);
  revalidatePath("/inventario");
  revalidatePath("/");
}
