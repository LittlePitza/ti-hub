"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";

// Revalidates the services board, the panel dashboard and the portal (which shows
// the outage notice for services flagged visible_portal).
function revalidate() {
  revalidatePath("/ti/servicios");
  revalidatePath("/ti");
  revalidatePath("/");
}

// ---------- Services (catalogue) ----------
export async function createService(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const nombre = v("nombre");
  if (!nombre) return;
  const { error } = await sb.from("servicios").insert({
    nombre,
    descripcion: v("descripcion"),
    categoria: v("categoria") ?? "plataforma",
    proveedor: v("proveedor"),
    criticidad: v("criticidad") ?? "normal",
    visible_portal: formData.get("visible_portal") === "on",
    orden: Number(v("orden")) || 0,
  });
  if (error) {
    console.error("[servicios] crear:", error.message);
    return;
  }
  revalidate();
}

export async function editService(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const id = formData.get("id") as string;
  const nombre = v("nombre");
  if (!id || !nombre) return;
  const { error } = await sb
    .from("servicios")
    .update({
      nombre,
      descripcion: v("descripcion"),
      categoria: v("categoria") ?? "plataforma",
      proveedor: v("proveedor"),
      criticidad: v("criticidad") ?? "normal",
      visible_portal: formData.get("visible_portal") === "on",
      orden: Number(v("orden")) || 0,
    })
    .eq("id", id);
  if (error) {
    console.error("[servicios] editar:", error.message);
    return;
  }
  revalidate();
}

export async function deleteService(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  // Deletes the service and, in cascade, its incident history (FK on delete cascade).
  const { error } = await sb.from("servicios").delete().eq("id", id);
  if (error) {
    console.error("[servicios] eliminar:", error.message);
    return;
  }
  revalidate();
}

// ---------- Incidents ----------
// Converts the value of an <input type="datetime-local"> to ISO; empty => now.
function momentFromForm(v: string | null): string {
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function openIncident(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const servicio_id = v("servicio_id");
  const titulo = v("titulo");
  if (!servicio_id || !titulo) return;
  const { error } = await sb.from("incidentes").insert({
    servicio_id,
    titulo,
    descripcion: v("descripcion"),
    tipo: v("tipo") ?? "caida",
    estado: "activo",
    inicio: momentFromForm(v("inicio")),
  });
  if (error) {
    console.error("[servicios] registrar incidente:", error.message);
    return;
  }
  revalidate();
}

// Moves an incident to "vigilando" (service restored, but still being watched).
export async function monitorIncident(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("incidentes").update({ estado: "vigilando" }).eq("id", id);
  if (error) {
    console.error("[servicios] vigilar incidente:", error.message);
    return;
  }
  revalidate();
}

// Resolves an incident: stamps `fin` (now, unless another time is given) and the
// closing note. The incident duration is derived from inicio -> fin.
export async function resolveIncident(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb
    .from("incidentes")
    .update({ estado: "resuelto", fin: momentFromForm(v("fin")), resolucion: v("resolucion") })
    .eq("id", id);
  if (error) {
    console.error("[servicios] resolver incidente:", error.message);
    return;
  }
  revalidate();
}

// Reopens a resolved incident: back to "activo", clearing the closure.
export async function reopenIncident(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb
    .from("incidentes")
    .update({ estado: "activo", fin: null, resolucion: null })
    .eq("id", id);
  if (error) {
    console.error("[servicios] reabrir incidente:", error.message);
    return;
  }
  revalidate();
}

export async function deleteIncident(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("incidentes").delete().eq("id", id);
  if (error) {
    console.error("[servicios] eliminar incidente:", error.message);
    return;
  }
  revalidate();
}
