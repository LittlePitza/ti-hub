"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAutenticado } from "@/lib/supabase";
import {
  ESTADOS_RESUELTOS,
  ESTADOS_SIN_ATENDER,
  PRIORIDADES,
  CATEGORIAS_TK,
  type EstadoTicket,
} from "@/lib/tickets";

function refrescar(id?: string) {
  revalidatePath("/ti/tickets");
  revalidatePath("/ti");
  if (id) revalidatePath(`/ti/tickets/${id}`);
}

// Identidad del técnico que ejecuta la acción (queda en la bitácora).
async function autorActual(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? "TI";
}

async function registrarEvento(
  sb: SupabaseClient,
  evento: {
    ticket_id: string;
    tipo: "comentario" | "estado" | "asignacion" | "sistema";
    autor: string;
    cuerpo?: string | null;
    estado_anterior?: string | null;
    estado_nuevo?: string | null;
  },
) {
  await sb.from("ticket_eventos").insert(evento);
}

const limpiar = (formData: FormData, k: string) =>
  (formData.get(k) as string)?.trim() || null;

export async function crearTicket(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;

  const categoria = CATEGORIAS_TK.includes(limpiar(formData, "categoria") as never)
    ? limpiar(formData, "categoria")
    : "hardware";
  const prioridad = PRIORIDADES.includes(limpiar(formData, "prioridad") as never)
    ? limpiar(formData, "prioridad")
    : "media";

  const { data } = await sb
    .from("tickets")
    .insert({
      titulo: limpiar(formData, "titulo"),
      descripcion: limpiar(formData, "descripcion"),
      solicitante: limpiar(formData, "solicitante"),
      categoria,
      prioridad,
      asignado_a: limpiar(formData, "asignado_a"),
    })
    .select("id")
    .single();

  if (data) {
    await registrarEvento(sb, {
      ticket_id: data.id,
      tipo: "sistema",
      autor: await autorActual(sb),
      cuerpo: "Ticket creado",
      estado_nuevo: "abierto",
    });
  }
  refrescar(data?.id);
}

// Edición completa de los campos del ticket (desde la página de detalle).
export async function editarTicket(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const titulo = limpiar(formData, "titulo");
  if (!titulo) return;

  const categoria = CATEGORIAS_TK.includes(limpiar(formData, "categoria") as never)
    ? limpiar(formData, "categoria")
    : "hardware";
  const prioridad = PRIORIDADES.includes(limpiar(formData, "prioridad") as never)
    ? limpiar(formData, "prioridad")
    : "media";

  await sb
    .from("tickets")
    .update({
      titulo,
      descripcion: limpiar(formData, "descripcion"),
      solicitante: limpiar(formData, "solicitante"),
      categoria,
      prioridad,
      asignado_a: limpiar(formData, "asignado_a"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await registrarEvento(sb, {
    ticket_id: id,
    tipo: "sistema",
    autor: await autorActual(sb),
    cuerpo: "Detalles del ticket actualizados",
  });
  refrescar(id);
}

export async function cambiarEstadoTicket(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const nuevo = formData.get("estado") as EstadoTicket;
  if (!id || !nuevo) return;

  const { data: actual } = await sb
    .from("tickets")
    .select("estado, primera_respuesta_at, resuelto_at")
    .eq("id", id)
    .single();
  if (!actual || actual.estado === nuevo) {
    refrescar(id);
    return;
  }

  const ahora = new Date().toISOString();
  const patch: Record<string, unknown> = { estado: nuevo, updated_at: ahora };

  // Primera respuesta: se marca al salir de un estado "sin atender" si aún no existía.
  if (!actual.primera_respuesta_at && !ESTADOS_SIN_ATENDER.includes(nuevo)) {
    patch.primera_respuesta_at = ahora;
  }
  // Resolución: se marca al pasar a resuelto/cerrado; se limpia al reabrir.
  if (ESTADOS_RESUELTOS.includes(nuevo) && !actual.resuelto_at) {
    patch.resuelto_at = ahora;
  } else if (nuevo === "reabierto" || nuevo === "abierto") {
    patch.resuelto_at = null;
  }

  await sb.from("tickets").update(patch).eq("id", id);
  await registrarEvento(sb, {
    ticket_id: id,
    tipo: "estado",
    autor: await autorActual(sb),
    cuerpo: limpiar(formData, "nota"),
    estado_anterior: actual.estado,
    estado_nuevo: nuevo,
  });
  refrescar(id);
}

export async function asignarTicket(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const asignado = limpiar(formData, "asignado_a");

  await sb
    .from("tickets")
    .update({ asignado_a: asignado, updated_at: new Date().toISOString() })
    .eq("id", id);
  await registrarEvento(sb, {
    ticket_id: id,
    tipo: "asignacion",
    autor: await autorActual(sb),
    cuerpo: asignado ? `Asignado a ${asignado}` : "Sin asignar",
  });
  refrescar(id);
}

export async function agregarComentario(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const cuerpo = limpiar(formData, "cuerpo");
  if (!id || !cuerpo) return;

  // Un comentario de TI cuenta como primer contacto si aún no se había registrado.
  const { data: actual } = await sb
    .from("tickets")
    .select("primera_respuesta_at")
    .eq("id", id)
    .single();
  if (actual && !actual.primera_respuesta_at) {
    await sb
      .from("tickets")
      .update({ primera_respuesta_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  await registrarEvento(sb, {
    ticket_id: id,
    tipo: "comentario",
    autor: await autorActual(sb),
    cuerpo,
  });
  refrescar(id);
}

export async function eliminarTicket(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("tickets").delete().eq("id", formData.get("id") as string);
  refrescar();
  // Si se elimina desde la página de detalle, esa ruta deja de existir.
  if (formData.get("desde") === "detalle") redirect("/ti/tickets");
}
