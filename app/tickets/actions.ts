"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export async function crearTicket(formData: FormData) {
  const sb = getSupabase();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  await sb.from("tickets").insert({
    titulo: v("titulo"),
    descripcion: v("descripcion"),
    solicitante: v("solicitante"),
    categoria: v("categoria"),
    prioridad: v("prioridad"),
    asignado_a: v("asignado_a"),
  });
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function cambiarEstadoTicket(formData: FormData) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("tickets")
    .update({ estado: formData.get("estado") as string, updated_at: new Date().toISOString() })
    .eq("id", formData.get("id") as string);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function eliminarTicket(formData: FormData) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("tickets").delete().eq("id", formData.get("id") as string);
  revalidatePath("/tickets");
  revalidatePath("/");
}
