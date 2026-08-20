"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";

function revalidate() {
  revalidatePath("/ti/tareas");
  revalidatePath("/ti");
}

// ---------- Tasks ----------
export async function createTask(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
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
  revalidate();
}

// Marks a task done or undone by stamping (or clearing) completada_at.
// The checkbox sends `completar=on` to close it; its absence reopens it.
export async function toggleTask(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
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
  revalidate();
}

export async function editTask(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
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
  revalidate();
}

export async function deleteTask(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("tareas").delete().eq("id", id);
  if (error) {
    console.error("[tareas] eliminar:", error.message);
    return;
  }
  revalidate();
}

// ---------- Projects ----------
export async function createProject(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
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
  revalidate();
}

export async function editProject(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
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
  revalidate();
}

// Deletes the project; its tasks fall back to the inbox (FK on delete set null).
export async function deleteProject(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("proyectos").delete().eq("id", id);
  if (error) {
    console.error("[proyectos] eliminar:", error.message);
    return;
  }
  revalidate();
}
