"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import {
  type TicketStatus,
  isUnattendedStatus,
  isResolvedStatus,
  isTicketCategory,
  isPriority,
} from "@/lib/domain/tickets";
import { PORTAL_STATUS, isValidEmail, nameFromEmail } from "@/lib/domain/portal";
import {
  getEmailConfig,
  isEmailReady,
  sendReply,
  sendStatusUpdate,
  sendTicketReceipt,
} from "@/lib/domain/email";
import { recompressForArchive } from "@/lib/utils/image";
import type { Attachment } from "@/lib/utils/attachments";
import type { TablesUpdate } from "@/types/database";

function revalidate(id?: string) {
  revalidatePath("/ti/tickets");
  revalidatePath("/ti");
  if (id) revalidatePath(`/ti/tickets/${id}`);
}

// Identity of the technician running the action (recorded in the activity log).
async function currentAuthor(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? "TI";
}

async function logEvent(
  sb: SupabaseClient,
  evento: {
    ticket_id: string;
    tipo: "comentario" | "estado" | "asignacion" | "sistema" | "respuesta";
    autor: string;
    cuerpo?: string | null;
    estado_anterior?: string | null;
    estado_nuevo?: string | null;
  },
) {
  const { error } = await sb.from("ticket_eventos").insert(evento);
  if (error) console.error("[tickets] registrar evento:", error.message);
}

const trimmed = (formData: FormData, k: string) => (formData.get(k) as string)?.trim() || null;

// When a ticket is archived its photos move to cold storage: they are
// recompressed (smaller, lower quality) and overwritten in place. Each attachment
// is flagged `comprimido` so it is not shrunk again if the ticket is archived
// once more. A failure here neither blocks nor breaks archiving.
async function compressArchivedAttachments(sb: SupabaseClient, id: string) {
  try {
    const { data } = await sb.from("tickets").select("adjuntos").eq("id", id).maybeSingle();
    const adjuntos: Attachment[] = Array.isArray(data?.adjuntos) ? data.adjuntos : [];
    if (!adjuntos.length) return;

    let cambio = false;
    for (const a of adjuntos) {
      if (a.comprimido) continue;
      const { data: blob } = await sb.storage.from("tickets").download(a.path);
      if (!blob) continue;
      const entrada = Buffer.from(await blob.arrayBuffer());
      const salida = await recompressForArchive(entrada);
      // Only replaced when it actually came out lighter; either way it is flagged
      // compressed so the next archive does not retry.
      if (salida && salida.length < entrada.length) {
        const { error } = await sb.storage
          .from("tickets")
          .upload(a.path, salida, { contentType: "image/webp", upsert: true });
        if (!error) a.tipo = "image/webp";
      }
      a.comprimido = true;
      cambio = true;
    }
    if (cambio) await sb.from("tickets").update({ adjuntos }).eq("id", id);
  } catch (e) {
    console.error("[tickets] no se pudieron recomprimir los adjuntos al archivar:", e);
  }
}

// First name for the email greeting: from `empleados` when available, otherwise
// derived from the address ("juan.perez@…" -> "Juan").
async function displayNameForEmail(sb: SupabaseClient, correo: string): Promise<string> {
  const { data } = await sb.from("empleados").select("nombre").eq("correo", correo).maybeSingle();
  return data?.nombre?.split(" ")[0] || nameFromEmail(correo);
}

// The state `createTicket` returns to useActionState in the panel modal: the
// modal closes and clears on `ok`, or shows `error` when something was missing or
// the insert failed.
export type EstadoCrear = { ok: true } | { ok: false; error: string } | null;

export async function createTicket(_prev: EstadoCrear, formData: FormData): Promise<EstadoCrear> {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  const titulo = trimmed(formData, "titulo");
  const solicitante = trimmed(formData, "solicitante");
  if (!titulo) return { ok: false, error: "Falta el asunto del ticket." };
  if (!solicitante) return { ok: false, error: "Indica quién es el solicitante." };

  // Hoisted so the membership test narrows the value: reading twice needed an
  // `as never` cast, which switched checking off rather than narrowing.
  const categoriaRaw = trimmed(formData, "categoria");
  const categoria = categoriaRaw && isTicketCategory(categoriaRaw) ? categoriaRaw : "hardware";
  const prioridadRaw = trimmed(formData, "prioridad");
  const prioridad = prioridadRaw && isPriority(prioridadRaw) ? prioridadRaw : "media";

  // The requester email links the ticket to their portal and enables the
  // notifications; it is stored only when well-formed (otherwise it stays NULL).
  const correoBruto = (trimmed(formData, "solicitante_email") ?? "").toLowerCase();
  const solicitanteEmail = isValidEmail(correoBruto) ? correoBruto : null;

  const { data, error } = await sb
    .from("tickets")
    .insert({
      titulo,
      descripcion: trimmed(formData, "descripcion"),
      solicitante,
      solicitante_email: solicitanteEmail,
      categoria,
      prioridad,
      asignado_a: trimmed(formData, "asignado_a"),
    })
    .select("id, num")
    .single();

  if (error || !data) return { ok: false, error: "No se pudo crear el ticket. Intenta de nuevo." };

  await logEvent(sb, {
    ticket_id: data.id,
    tipo: "sistema",
    autor: await currentAuthor(sb),
    cuerpo: "Ticket creado",
    estado_nuevo: "abierto",
  });

  // Receipt to the requester: only when IT ticked the box and there is a valid
  // address. Deferred with after() so the modal closes immediately without waiting
  // for delivery.
  if (formData.get("notificar") === "on" && solicitanteEmail) {
    const num = data.num;
    after(async () => {
      try {
        const c = await getEmailConfig(sb);
        if (isEmailReady(c)) {
          await sendTicketReceipt(c, sb, {
            para: solicitanteEmail,
            num,
            titulo,
            nombre: await displayNameForEmail(sb, solicitanteEmail),
          });
        }
      } catch (e) {
        console.error("[tickets] correo de ticket creado falló:", e);
      }
    });
  }

  revalidate(data.id);
  return { ok: true };
}

// Full edit of the ticket fields (from the detail page).
export async function editTicket(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const titulo = trimmed(formData, "titulo");
  if (!titulo) return;

  const categoriaRaw = trimmed(formData, "categoria");
  const categoria = categoriaRaw && isTicketCategory(categoriaRaw) ? categoriaRaw : "hardware";
  const prioridadRaw = trimmed(formData, "prioridad");
  const prioridad = prioridadRaw && isPriority(prioridadRaw) ? prioridadRaw : "media";

  // `solicitante` is NOT NULL: clearing the field used to send null, which
  // Postgres rejected and the catch swallowed, so the edit silently did nothing.
  const solicitante = trimmed(formData, "solicitante");
  if (!solicitante) return;

  const { error } = await sb
    .from("tickets")
    .update({
      titulo,
      descripcion: trimmed(formData, "descripcion"),
      solicitante,
      categoria,
      prioridad,
      asignado_a: trimmed(formData, "asignado_a"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("[tickets] editar:", error.message);
    return;
  }

  await logEvent(sb, {
    ticket_id: id,
    tipo: "sistema",
    autor: await currentAuthor(sb),
    cuerpo: "Detalles del ticket actualizados",
  });
  revalidate(id);
}

export async function changeTicketStatus(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  const nuevo = formData.get("estado") as TicketStatus;
  if (!id || !nuevo) return;

  const { data: actual } = await sb
    .from("tickets")
    .select("estado, primera_respuesta_at, resuelto_at, num, titulo, solicitante_email")
    .eq("id", id)
    .single();
  if (!actual || actual.estado === nuevo) {
    revalidate(id);
    return;
  }

  const ahora = new Date().toISOString();
  const patch: TablesUpdate<"tickets"> = { estado: nuevo, updated_at: ahora };

  // First response: stamped when leaving an unattended status, if not already set.
  if (!actual.primera_respuesta_at && !isUnattendedStatus(nuevo)) {
    patch.primera_respuesta_at = ahora;
  }
  // Resolution: stamped on moving to resolved/closed; cleared on reopening.
  if (isResolvedStatus(nuevo) && !actual.resuelto_at) {
    patch.resuelto_at = ahora;
  } else if (nuevo === "reabierto" || nuevo === "abierto") {
    patch.resuelto_at = null;
  }

  const { error } = await sb.from("tickets").update(patch).eq("id", id);
  if (error) {
    console.error("[tickets] cambiar estado:", error.message);
    return;
  }
  await logEvent(sb, {
    ticket_id: id,
    tipo: "estado",
    autor: await currentAuthor(sb),
    cuerpo: trimmed(formData, "nota"),
    estado_anterior: actual.estado,
    estado_nuevo: nuevo,
  });

  // Cold storage: on archiving, recompress the ticket photos.
  if (nuevo === "archivado") await compressArchivedAttachments(sb, id);

  // Notice to the requester: only when IT ticked the box (never automatic, to
  // avoid flooding them).
  if (formData.get("notificar") === "on" && isValidEmail(actual.solicitante_email ?? "")) {
    const c = await getEmailConfig(sb);
    if (isEmailReady(c)) {
      const email = actual.solicitante_email!;
      await sendStatusUpdate(c, sb, {
        para: email,
        num: actual.num,
        titulo: actual.titulo,
        nombre: await displayNameForEmail(sb, email),
        estado: PORTAL_STATUS[nuevo]?.text ?? nuevo,
      });
    }
  }
  revalidate(id);
}

export async function assignTicket(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const asignado = trimmed(formData, "asignado_a");

  const { error } = await sb
    .from("tickets")
    .update({ asignado_a: asignado, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[tickets] asignar:", error.message);
    return;
  }
  await logEvent(sb, {
    ticket_id: id,
    tipo: "asignacion",
    autor: await currentAuthor(sb),
    cuerpo: asignado ? `Asignado a ${asignado}` : "Sin asignar",
  });
  revalidate(id);
}

export async function addComment(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  const cuerpo = trimmed(formData, "cuerpo");
  if (!id || !cuerpo) return;

  // A comment from IT counts as first contact if none had been recorded yet.
  const { data: actual } = await sb
    .from("tickets")
    .select("primera_respuesta_at")
    .eq("id", id)
    .single();
  if (actual && !actual.primera_respuesta_at) {
    await sb
      .from("tickets")
      .update({
        primera_respuesta_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  await logEvent(sb, {
    ticket_id: id,
    tipo: "comentario",
    autor: await currentAuthor(sb),
    cuerpo,
  });
  revalidate(id);
}

// A reply visible to the requester: stored as a `respuesta` event, which the
// employee portal shows (filtered by their email). It counts as first contact
// from IT if none had been recorded. This is what distinguishes an internal note
// (IT only) from a message to the requester.
export async function replyToRequester(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  const cuerpo = trimmed(formData, "cuerpo");
  if (!id || !cuerpo) return;

  const { data: actual } = await sb
    .from("tickets")
    .select("num, titulo, solicitante_email, primera_respuesta_at")
    .eq("id", id)
    .single();
  if (actual && !actual.primera_respuesta_at) {
    await sb
      .from("tickets")
      .update({
        primera_respuesta_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  await logEvent(sb, {
    ticket_id: id,
    tipo: "respuesta",
    autor: await currentAuthor(sb),
    cuerpo,
  });

  // The reply is always visible in the portal; it goes out by email only when IT
  // ticked the box. The email is deferred with after(): the panel responds
  // immediately and delivery, which can take seconds, happens afterwards.
  if (
    formData.get("notificar") === "on" &&
    actual &&
    isValidEmail(actual.solicitante_email ?? "")
  ) {
    const email = actual.solicitante_email!;
    const datosCorreo = { num: actual.num, titulo: actual.titulo, mensaje: cuerpo };
    after(async () => {
      try {
        const c = await getEmailConfig(sb);
        if (isEmailReady(c)) {
          await sendReply(c, sb, {
            para: email,
            num: datosCorreo.num,
            titulo: datosCorreo.titulo,
            nombre: await displayNameForEmail(sb, email),
            mensaje: datosCorreo.mensaje,
          });
        }
      } catch (e) {
        console.error("[tickets] correo de respuesta al cliente falló:", e);
      }
    });
  }
  revalidate(id);
  revalidatePath("/"); // the employee portal shows the replies from IT
}

export async function deleteTicket(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("tickets")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[tickets] eliminar:", error.message);
    return;
  }
  revalidate();
  // When deleted from the detail page, that route ceases to exist.
  if (formData.get("desde") === "detalle") redirect("/ti/tickets");
}
