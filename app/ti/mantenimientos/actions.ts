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
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}

export async function cambiarEstadoMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("mantenimientos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}

export async function editarMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  const id = formData.get("id") as string;
  if (!id || !v("titulo") || !v("fecha_programada")) return;
  await sb.from("mantenimientos").update({
    titulo: v("titulo"),
    tipo: v("tipo"),
    fecha_programada: v("fecha_programada"),
    responsable: v("responsable"),
    equipo_id: v("equipo_id"),
    notas: v("notas"),
  }).eq("id", id);
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}

export async function eliminarMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("mantenimientos").delete().eq("id", formData.get("id") as string);
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}
