"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { lector, lectorOpc } from "@/lib/form";

export async function crearMantenimiento(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const o = lectorOpc(formData);
  // titulo and fecha_programada are NOT NULL without a default: an empty field
  // used to send null, which Postgres rejected and the catch below swallowed --
  // the form simply appeared to do nothing. The edit path already guarded.
  const titulo = v("titulo");
  const fechaProgramada = v("fecha_programada");
  if (!titulo || !fechaProgramada) return;
  const { error } = await sb.from("mantenimientos").insert({
    titulo,
    tipo: o("tipo"),
    fecha_programada: fechaProgramada,
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
  const { error } = await sb
    .from("mantenimientos")
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
  const o = lectorOpc(formData);
  const id = formData.get("id") as string;
  const titulo = v("titulo");
  const fechaProgramada = v("fecha_programada");
  if (!id || !titulo || !fechaProgramada) return;
  const { error } = await sb
    .from("mantenimientos")
    .update({
      titulo,
      tipo: o("tipo"),
      fecha_programada: fechaProgramada,
      responsable: v("responsable"),
      equipo_id: v("equipo_id"),
      notas: v("notas"),
    })
    .eq("id", id);
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
  const { error } = await sb
    .from("mantenimientos")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[mantenimientos] eliminar:", error.message);
    return;
  }
  revalidatePath("/ti/mantenimientos");
  revalidatePath("/ti");
}
