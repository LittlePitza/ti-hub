"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase/client";
import { lector } from "@/lib/utils/form";

// Refresca el tablero de servicios, el resumen del panel y el portal (que
// muestra el aviso de caídas de servicios con visible_portal).
function refrescar() {
  revalidatePath("/ti/servicios");
  revalidatePath("/ti");
  revalidatePath("/");
}

// ---------- Servicios (catálogo) ----------
export async function crearServicio(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
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
  refrescar();
}

export async function editarServicio(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
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
  refrescar();
}

export async function eliminarServicio(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  // Borra el servicio y, en cascada, su historial de incidentes (FK on delete cascade).
  const { error } = await sb.from("servicios").delete().eq("id", id);
  if (error) {
    console.error("[servicios] eliminar:", error.message);
    return;
  }
  refrescar();
}

// ---------- Incidentes ----------
// Convierte el valor de un <input type="datetime-local"> a ISO; vacío => ahora.
function momentoDeForm(v: string | null): string {
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function registrarIncidente(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const servicio_id = v("servicio_id");
  const titulo = v("titulo");
  if (!servicio_id || !titulo) return;
  const { error } = await sb.from("incidentes").insert({
    servicio_id,
    titulo,
    descripcion: v("descripcion"),
    tipo: v("tipo") ?? "caida",
    estado: "activo",
    inicio: momentoDeForm(v("inicio")),
  });
  if (error) {
    console.error("[servicios] registrar incidente:", error.message);
    return;
  }
  refrescar();
}

// Pasa un incidente a "vigilando" (ya se restableció pero se observa).
export async function vigilarIncidente(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("incidentes").update({ estado: "vigilando" }).eq("id", id);
  if (error) {
    console.error("[servicios] vigilar incidente:", error.message);
    return;
  }
  refrescar();
}

// Resuelve un incidente: sella `fin` (ahora, salvo que se indique otro) y la nota
// de cierre. La duración del incidente se deriva de inicio → fin.
export async function resolverIncidente(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb
    .from("incidentes")
    .update({ estado: "resuelto", fin: momentoDeForm(v("fin")), resolucion: v("resolucion") })
    .eq("id", id);
  if (error) {
    console.error("[servicios] resolver incidente:", error.message);
    return;
  }
  refrescar();
}

// Reabre un incidente resuelto: vuelve a "activo" y limpia el cierre.
export async function reabrirIncidente(formData: FormData) {
  const sb = await getSupabaseAutenticado();
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
  refrescar();
}

export async function eliminarIncidente(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { error } = await sb.from("incidentes").delete().eq("id", id);
  if (error) {
    console.error("[servicios] eliminar incidente:", error.message);
    return;
  }
  refrescar();
}
