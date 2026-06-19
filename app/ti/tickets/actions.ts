"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
import { ESTADO_PORTAL, correoValido, nombreDeCorreo } from "@/lib/portal";
import { getConfigCorreo, correoOperativo, enviarRespuesta, enviarEstado, enviarTicketCreado } from "@/lib/correo";
import { recomprimirArchivado } from "@/lib/imagen";
import type { Adjunto } from "@/lib/adjuntos";

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
    tipo: "comentario" | "estado" | "asignacion" | "sistema" | "respuesta";
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

// Al archivar un ticket, sus fotos pasan a almacenamiento en frío: se recomprimen
// (más pequeñas, menor calidad) y se sobreescriben en su misma ruta. Cada adjunto
// se marca `comprimido` para no re-encogerlo si el ticket se vuelve a archivar.
// No bloquea ni rompe el archivado si algo falla.
async function comprimirAdjuntosArchivados(sb: SupabaseClient, id: string) {
  try {
    const { data } = await sb.from("tickets").select("adjuntos").eq("id", id).maybeSingle();
    const adjuntos: Adjunto[] = Array.isArray(data?.adjuntos) ? data.adjuntos : [];
    if (!adjuntos.length) return;

    let cambio = false;
    for (const a of adjuntos) {
      if (a.comprimido) continue;
      const { data: blob } = await sb.storage.from("tickets").download(a.path);
      if (!blob) continue;
      const entrada = Buffer.from(await blob.arrayBuffer());
      const salida = await recomprimirArchivado(entrada);
      // Solo se reemplaza si realmente quedó más liviana; en cualquier caso se
      // marca comprimido para no reintentar en el siguiente archivado.
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

// Nombre de pila para el saludo del correo: el de `empleados` si existe, si no el
// derivado del correo ("juan.perez@…" -> "Juan").
async function nombreParaCorreo(sb: SupabaseClient, correo: string): Promise<string> {
  const { data } = await sb.from("empleados").select("nombre").eq("correo", correo).maybeSingle();
  return data?.nombre?.split(" ")[0] || nombreDeCorreo(correo);
}

// Estado que `crearTicket` devuelve a useActionState en el modal del panel: el modal
// se cierra y limpia cuando `ok`, o muestra `error` si faltó algo o falló la inserción.
export type EstadoCrear = { ok: true } | { ok: false; error: string } | null;

export async function crearTicket(_prev: EstadoCrear, formData: FormData): Promise<EstadoCrear> {
  const sb = await getSupabaseAutenticado();
  if (!sb) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  const titulo = limpiar(formData, "titulo");
  const solicitante = limpiar(formData, "solicitante");
  if (!titulo) return { ok: false, error: "Falta el asunto del ticket." };
  if (!solicitante) return { ok: false, error: "Indica quién es el solicitante." };

  const categoria = CATEGORIAS_TK.includes(limpiar(formData, "categoria") as never)
    ? limpiar(formData, "categoria")
    : "hardware";
  const prioridad = PRIORIDADES.includes(limpiar(formData, "prioridad") as never)
    ? limpiar(formData, "prioridad")
    : "media";

  // El correo del solicitante liga el ticket a su portal y habilita los avisos; se
  // guarda solo si tiene forma válida (de lo contrario queda NULL).
  const correoBruto = (limpiar(formData, "solicitante_email") ?? "").toLowerCase();
  const solicitanteEmail = correoValido(correoBruto) ? correoBruto : null;

  const { data, error } = await sb
    .from("tickets")
    .insert({
      titulo,
      descripcion: limpiar(formData, "descripcion"),
      solicitante,
      solicitante_email: solicitanteEmail,
      categoria,
      prioridad,
      asignado_a: limpiar(formData, "asignado_a"),
    })
    .select("id, num")
    .single();

  if (error || !data) return { ok: false, error: "No se pudo crear el ticket. Intenta de nuevo." };

  await registrarEvento(sb, {
    ticket_id: data.id,
    tipo: "sistema",
    autor: await autorActual(sb),
    cuerpo: "Ticket creado",
    estado_nuevo: "abierto",
  });

  // Aviso al solicitante: solo si TI marcó la casilla y hay correo válido. Se difiere
  // con after() para que el modal cierre de inmediato sin esperar al envío.
  if (formData.get("notificar") === "on" && solicitanteEmail) {
    const num = data.num;
    after(async () => {
      try {
        const c = await getConfigCorreo(sb);
        if (correoOperativo(c)) {
          await enviarTicketCreado(c, sb, {
            para: solicitanteEmail,
            num,
            titulo,
            nombre: await nombreParaCorreo(sb, solicitanteEmail),
          });
        }
      } catch (e) {
        console.error("[tickets] correo de ticket creado falló:", e);
      }
    });
  }

  refrescar(data.id);
  return { ok: true };
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
    .select("estado, primera_respuesta_at, resuelto_at, num, titulo, solicitante_email")
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

  // Almacenamiento en frío: al archivar, recomprimir las fotos del ticket.
  if (nuevo === "archivado") await comprimirAdjuntosArchivados(sb, id);

  // Aviso al solicitante: solo si TI marcó la casilla (no automático, para no saturar).
  if (formData.get("notificar") === "on" && correoValido(actual.solicitante_email ?? "")) {
    const c = await getConfigCorreo(sb);
    if (correoOperativo(c)) {
      const email = actual.solicitante_email!;
      await enviarEstado(c, sb, {
        para: email,
        num: actual.num,
        titulo: actual.titulo,
        nombre: await nombreParaCorreo(sb, email),
        estado: ESTADO_PORTAL[nuevo]?.texto ?? nuevo,
      });
    }
  }
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

// Respuesta visible para el solicitante: se guarda como evento `respuesta` y el
// portal del empleado la muestra (filtrada por su correo). Cuenta como primer
// contacto de TI si aún no se había registrado. Es lo que distingue una nota
// interna (solo TI) de un mensaje al cliente.
export async function responderCliente(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const cuerpo = limpiar(formData, "cuerpo");
  if (!id || !cuerpo) return;

  const { data: actual } = await sb
    .from("tickets")
    .select("num, titulo, solicitante_email, primera_respuesta_at")
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
    tipo: "respuesta",
    autor: await autorActual(sb),
    cuerpo,
  });

  // La respuesta se ve siempre en el portal; por correo solo si TI marcó la casilla.
  // El correo se difiere con after(): el panel responde de inmediato y el envío
  // (que puede tardar segundos) ocurre después de mandar la respuesta.
  if (formData.get("notificar") === "on" && actual && correoValido(actual.solicitante_email ?? "")) {
    const email = actual.solicitante_email!;
    const datosCorreo = { num: actual.num, titulo: actual.titulo, mensaje: cuerpo };
    after(async () => {
      try {
        const c = await getConfigCorreo(sb);
        if (correoOperativo(c)) {
          await enviarRespuesta(c, sb, {
            para: email,
            num: datosCorreo.num,
            titulo: datosCorreo.titulo,
            nombre: await nombreParaCorreo(sb, email),
            mensaje: datosCorreo.mensaje,
          });
        }
      } catch (e) {
        console.error("[tickets] correo de respuesta al cliente falló:", e);
      }
    });
  }
  refrescar(id);
  revalidatePath("/"); // el portal del empleado muestra las respuestas de TI
}

export async function eliminarTicket(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("tickets").delete().eq("id", formData.get("id") as string);
  refrescar();
  // Si se elimina desde la página de detalle, esa ruta deja de existir.
  if (formData.get("desde") === "detalle") redirect("/ti/tickets");
}
