"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabasePortal } from "@/lib/supabase";
import { COOKIE_PORTAL, CATEGORIAS_PORTAL, correoValido, normalizarCorreo, getCorreoPortal } from "@/lib/portal";
import { getConfigCorreo, avisaNuevo, enviarNuevoTicket } from "@/lib/correo";
import { MAX_ADJUNTOS, esImagenValida, type Adjunto } from "@/lib/adjuntos";

const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function entrarPortal(formData: FormData) {
  const correo = normalizarCorreo((formData.get("correo") as string) ?? "");
  if (!correoValido(correo)) redirect("/?error=correo");
  const jar = await cookies();
  jar.set(COOKIE_PORTAL, correo, { ...OPCIONES_COOKIE, maxAge: 60 * 60 * 24 * 180 });
  redirect("/");
}

export async function salirPortal() {
  const jar = await cookies();
  jar.set(COOKIE_PORTAL, "", { ...OPCIONES_COOKIE, maxAge: 0 });
  redirect("/");
}

// Archivar: el empleado guarda su reporte en una pestaña aparte. Es un estado
// COMPARTIDO: el ticket pasa a 'archivado' también para TI (sale de su trabajo a
// la vista). La service role salta el RLS, así que se filtra por su correo.
export async function archivarReportePortal(formData: FormData) {
  const correo = await getCorreoPortal();
  if (!correo) redirect("/");
  const id = (formData.get("id") as string)?.trim();
  if (!id) redirect("/");

  const sb = getSupabasePortal();
  if (!sb) redirect("/");

  const { data: t } = await sb
    .from("tickets")
    .select("id, estado, resuelto_at")
    .eq("id", id)
    .eq("solicitante_email", correo)
    .maybeSingle();
  if (!t || t.estado === "archivado") redirect("/");

  const ahora = new Date().toISOString();
  await sb
    .from("tickets")
    .update({ estado: "archivado", resuelto_at: t.resuelto_at ?? ahora, updated_at: ahora })
    .eq("id", id);
  await sb.from("ticket_eventos").insert({
    ticket_id: id,
    tipo: "estado",
    autor: correo,
    cuerpo: "Archivado por el solicitante desde el portal",
    estado_anterior: t.estado,
    estado_nuevo: "archivado",
  });

  refrescarTodo(id);
  redirect("/");
}

// Reactivar: saca el reporte de archivados y lo regresa a la bandeja de TI.
export async function reactivarReportePortal(formData: FormData) {
  const correo = await getCorreoPortal();
  if (!correo) redirect("/");
  const id = (formData.get("id") as string)?.trim();
  if (!id) redirect("/");

  const sb = getSupabasePortal();
  if (!sb) redirect("/");

  const { data: t } = await sb
    .from("tickets")
    .select("id, estado")
    .eq("id", id)
    .eq("solicitante_email", correo)
    .maybeSingle();
  if (!t || t.estado !== "archivado") redirect("/");

  await sb
    .from("tickets")
    .update({ estado: "reabierto", resuelto_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  await sb.from("ticket_eventos").insert({
    ticket_id: id,
    tipo: "estado",
    autor: correo,
    cuerpo: "Reactivado por el solicitante desde el portal",
    estado_anterior: "archivado",
    estado_nuevo: "reabierto",
  });

  refrescarTodo(id);
  redirect("/");
}

function refrescarTodo(id: string) {
  revalidatePath("/");
  revalidatePath(`/reporte/${id}`);
  revalidatePath("/ti/tickets");
  revalidatePath("/ti");
  revalidatePath(`/ti/tickets/${id}`);
}

export async function crearTicketPortal(formData: FormData) {
  const correo = await getCorreoPortal();
  if (!correo) redirect("/");
  const sb = getSupabasePortal();
  if (!sb) redirect("/?error=config");

  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  const titulo = v("titulo");
  if (!titulo) redirect("/nuevo?error=resumen");
  const categoria = CATEGORIAS_PORTAL.some((c) => c.valor === v("categoria"))
    ? v("categoria")
    : "otro";

  // El equipo elegido debe pertenecer al correo del empleado; si no, se descarta.
  let equipoId = v("equipo_id");
  if (equipoId === "ninguno") equipoId = null;
  if (equipoId) {
    const { data: eq } = await sb
      .from("equipos")
      .select("id")
      .eq("id", equipoId)
      .eq("asignado_email", correo)
      .maybeSingle();
    if (!eq) equipoId = null;
  }

  // Si el correo está en el directorio de empleados, el ticket lleva su nombre.
  const { data: empleado } = await sb
    .from("empleados")
    .select("nombre")
    .eq("correo", correo)
    .maybeSingle();

  const { data, error } = await sb
    .from("tickets")
    .insert({
      titulo,
      descripcion: v("descripcion"),
      categoria,
      solicitante: empleado?.nombre ?? correo,
      solicitante_email: correo,
      equipo_id: equipoId,
      prioridad: "media", // TI la ajusta desde el panel; el empleado no ve prioridades
    })
    .select("id, num")
    .single();
  if (error || !data) redirect("/nuevo?error=guardar");

  // Fotos adjuntas (opcional): se suben al bucket privado `tickets` y se guarda
  // la lista de referencias en el ticket. Si algo falla aquí no se pierde el
  // reporte (ya quedó guardado): solo se queda sin imágenes.
  try {
    const archivos = formData.getAll("imagenes").filter((f): f is File => f instanceof File);
    const validas = archivos.filter((f) => esImagenValida(f)).slice(0, MAX_ADJUNTOS);
    const adjuntos: Adjunto[] = [];
    for (const [i, file] of validas.entries()) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `${data.id}/${Date.now()}-${i}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: errSubida } = await sb.storage
        .from("tickets")
        .upload(path, buffer, { contentType: file.type || "image/jpeg" });
      if (!errSubida) adjuntos.push({ path, nombre: file.name, tipo: file.type });
    }
    if (adjuntos.length) await sb.from("tickets").update({ adjuntos }).eq("id", data.id);
  } catch (e) {
    console.error("[portal] no se pudieron subir las imágenes del reporte:", e);
  }

  // Aviso interno a TI (configurable en /ti/correo). El envío SMTP/Graph puede tardar
  // segundos, así que se difiere con after(): el empleado ve su confirmación al
  // instante y el correo sale después de responder. No bloquea ni rompe la creación
  // si el correo falla: el ticket ya quedó guardado.
  after(async () => {
    try {
      const c = await getConfigCorreo(sb);
      if (avisaNuevo(c)) {
        const base = c.sitio_url?.replace(/\/+$/, "");
        const categoriaTexto = CATEGORIAS_PORTAL.find((x) => x.valor === categoria)?.titulo ?? categoria!;
        await enviarNuevoTicket(c, sb, {
          num: data.num,
          titulo: titulo!,
          solicitante: empleado?.nombre ?? correo,
          categoria: categoriaTexto,
          descripcion: v("descripcion") ?? "",
          enlace: base ? `${base}/ti/tickets/${data.id}` : null,
        });
      }
    } catch (e) {
      console.error("[portal] aviso de ticket nuevo falló:", e);
    }
  });

  revalidatePath("/");
  revalidatePath("/ti/tickets");
  revalidatePath("/ti");
  redirect(`/?creado=${data.num}`);
}
