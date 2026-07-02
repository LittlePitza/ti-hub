"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { lector } from "@/lib/form";

export async function crearMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const { error } = await sb.from("mantenimientos").insert({
    titulo: v("titulo"),
    tipo: v("tipo"),
    fecha_programada: v("fecha_programada"),
    responsable: v("responsable"),
    equipo_id: v("equipo_id"),
    notas: v("notas"),
  });
  if (error) {
    console.error("[mantenimientos] crear:", error.message);
    return;
  }
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}

export async function cambiarEstadoMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const { error } = await sb.from("mantenimientos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[mantenimientos] cambiar estado:", error.message);
    return;
  }
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}

export async function editarMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  if (!id || !v("titulo") || !v("fecha_programada")) return;
  const { error } = await sb.from("mantenimientos").update({
    titulo: v("titulo"),
    tipo: v("tipo"),
    fecha_programada: v("fecha_programada"),
    responsable: v("responsable"),
    equipo_id: v("equipo_id"),
    notas: v("notas"),
  }).eq("id", id);
  if (error) {
    console.error("[mantenimientos] editar:", error.message);
    return;
  }
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}

export async function eliminarMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const { error } = await sb.from("mantenimientos").delete().eq("id", formData.get("id") as string);
  if (error) {
    console.error("[mantenimientos] eliminar:", error.message);
    return;
  }
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}
