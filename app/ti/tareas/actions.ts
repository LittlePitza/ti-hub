"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase/client";
import { lector } from "@/lib/utils/form";

function refrescar() {
  revalidatePath("/ti/tareas");
  revalidatePath("/ti");
}

// ---------- Tareas ----------
export async function crearTarea(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const titulo = v("titulo");
  if (!titulo) return;
  const { error } = await sb.from("tareas").insert({
    titulo,
    notas: v("notas"),
    proyecto_id: v("proyecto_id"), // null = bandeja
    prioridad: v("prioridad") ?? "normal",
    fecha_limite: v("fecha_limite"),
  });
  if (error) {
    console.error("[tareas] crear:", error.message);
    return;
  }
  refrescar();
}

// Marca/desmarca una tarea como completada sellando (o limpiando) completada_at.
// La casilla envía `completar=on` cuando se quiere cerrar; su ausencia reabre.
export async function alternarTarea(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const completar = formData.get("completar") === "on";
  const { error } = await sb
    .from("tareas")
    .update({ completada_at: completar ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    console.error("[tareas] alternar:", error.message);
    return;
  }
  refrescar();
}

export async function editarTarea(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  const titulo = v("titulo");
  if (!id || !titulo) return;
  const { error } = await sb
    .from("tareas")
    .update({
      titulo,
      notas: v("notas"),
      proyecto_id: v("proyecto_id"),
      prioridad: v("prioridad") ?? "normal",
      fecha_limite: v("fecha_limite"),
    })
    .eq("id", id);
  if (error) {
    console.error("[tareas] editar:", error.message);
    return;
  }
  refrescar();
}

export async function eliminarTarea(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("tareas").delete().eq("id", id);
  if (error) {
    console.error("[tareas] eliminar:", error.message);
    return;
  }
  refrescar();
}

// ---------- Proyectos ----------
export async function crearProyecto(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const nombre = v("nombre");
  if (!nombre) return;
  const { error } = await sb.from("proyectos").insert({
    nombre,
    descripcion: v("descripcion"),
    fecha_objetivo: v("fecha_objetivo"),
  });
  if (error) {
    console.error("[proyectos] crear:", error.message);
    return;
  }
  refrescar();
}

export async function editarProyecto(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  const nombre = v("nombre");
  if (!id || !nombre) return;
  const { error } = await sb
    .from("proyectos")
    .update({
      nombre,
      descripcion: v("descripcion"),
      estado: v("estado") ?? "activo",
      fecha_objetivo: v("fecha_objetivo"),
    })
    .eq("id", id);
  if (error) {
    console.error("[proyectos] editar:", error.message);
    return;
  }
  refrescar();
}

// Borra el proyecto; sus tareas quedan en la bandeja (FK on delete set null).
export async function eliminarProyecto(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("proyectos").delete().eq("id", id);
  if (error) {
    console.error("[proyectos] eliminar:", error.message);
    return;
  }
  refrescar();
}
