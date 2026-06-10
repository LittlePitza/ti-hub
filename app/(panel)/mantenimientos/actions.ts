"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";

export async function crearMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  await sb.from("mantenimientos").insert({
    titulo: v("titulo"),
    tipo: v("tipo"),
    fecha_programada: v("fecha_programada"),
    responsable: v("responsable"),
    equipo_id: v("equipo_id"),
    notas: v("notas"),
  });
  revalidatePath("/mantenimientos");
  revalidatePath("/");
}

export async function cambiarEstadoMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("mantenimientos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  revalidatePath("/mantenimientos");
  revalidatePath("/");
}

export async function eliminarMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("mantenimientos").delete().eq("id", formData.get("id") as string);
  revalidatePath("/mantenimientos");
  revalidatePath("/");
}
