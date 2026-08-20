"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getPortalSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";
import {
  PORTAL_COOKIE,
  PORTAL_CATEGORIES,
  isValidEmail,
  normalizeEmail,
  getPortalEmail,
} from "@/lib/domain/portal";
import { getEmailConfig, notifiesOnNewTicket, sendNewTicketAlert } from "@/lib/domain/email";
import { MAX_ATTACHMENTS, isValidImage, type Attachment } from "@/lib/utils/attachments";

const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function signInToPortal(formData: FormData) {
  const correo = normalizeEmail((formData.get("correo") as string) ?? "");
  if (!isValidEmail(correo)) redirect("/?error=correo");
  const jar = await cookies();
  jar.set(PORTAL_COOKIE, correo, { ...OPCIONES_COOKIE, maxAge: 60 * 60 * 24 * 180 });
  redirect("/");
}

export async function signOutOfPortal() {
  const jar = await cookies();
  jar.set(PORTAL_COOKIE, "", { ...OPCIONES_COOKIE, maxAge: 0 });
  redirect("/");
}

// Archive: the employee files their report away into a separate tab. This is a
// SHARED status — the ticket also moves to 'archivado' for IT (leaving their
// visible workload). The service role bypasses RLS, so the query filters by the
// employee email.
export async function archivePortalReport(formData: FormData) {
  const correo = await getPortalEmail();
  if (!correo) redirect("/");
  const id = (formData.get("id") as string)?.trim();
  if (!id) redirect("/");

  const sb = getPortalSupabase();
  if (!sb) redirect("/");

  const { data: t } = await sb
    .from("tickets")
    .select("id, estado, resuelto_at")
    .eq("id", id)
    .eq("solicitante_email", correo)
    .maybeSingle();
  if (!t || t.estado === "archivado") redirect("/");

  const ahora = new Date().toISOString();
  const { error } = await sb
    .from("tickets")
    .update({ estado: "archivado", resuelto_at: t.resuelto_at ?? ahora, updated_at: ahora })
    .eq("id", id);
  if (error) {
    console.error("[portal] archivar reporte:", error.message);
    redirect("/");
  }
  await sb.from("ticket_eventos").insert({
    ticket_id: id,
    tipo: "estado",
    autor: correo,
    cuerpo: "Archivado por el solicitante desde el portal",
    estado_anterior: t.estado,
    estado_nuevo: "archivado",
  });

  revalidateAll(id);
  redirect("/");
}

// Reactivate: pulls the report out of the archive and back into the IT queue.
export async function reopenPortalReport(formData: FormData) {
  const correo = await getPortalEmail();
  if (!correo) redirect("/");
  const id = (formData.get("id") as string)?.trim();
  if (!id) redirect("/");

  const sb = getPortalSupabase();
  if (!sb) redirect("/");

  const { data: t } = await sb
    .from("tickets")
    .select("id, estado")
    .eq("id", id)
    .eq("solicitante_email", correo)
    .maybeSingle();
  if (!t || t.estado !== "archivado") redirect("/");

  const { error } = await sb
    .from("tickets")
    .update({ estado: "reabierto", resuelto_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[portal] reactivar reporte:", error.message);
    redirect("/");
  }
  await sb.from("ticket_eventos").insert({
    ticket_id: id,
    tipo: "estado",
    autor: correo,
    cuerpo: "Reactivado por el solicitante desde el portal",
    estado_anterior: "archivado",
    estado_nuevo: "reabierto",
  });

  revalidateAll(id);
  redirect("/");
}

function revalidateAll(id: string) {
  revalidatePath("/");
  revalidatePath(`/reporte/${id}`);
  revalidatePath("/ti/tickets");
  revalidatePath("/ti");
  revalidatePath(`/ti/tickets/${id}`);
}

export async function createPortalReport(formData: FormData) {
  const correo = await getPortalEmail();
  if (!correo) redirect("/");
  const sb = getPortalSupabase();
  if (!sb) redirect("/?error=config");

  const v = reader(formData);
  const titulo = v("titulo");
  if (!titulo) redirect("/nuevo?error=resumen");
  const categoriaRaw = v("categoria");
  const categoria =
    categoriaRaw && PORTAL_CATEGORIES.some((c) => c.value === categoriaRaw) ? categoriaRaw : "otro";

  // The chosen device must belong to the employee email, otherwise it is dropped.
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

  // If the email is in the employee directory, the ticket carries their name.
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
      prioridad: "media", // IT adjusts it from the panel; the employee never sees priorities
    })
    .select("id, num")
    .single();
  if (error || !data) redirect("/nuevo?error=guardar");

  // Photo attachments (optional): uploaded to the private `tickets` bucket, with
  // the list of references stored on the ticket. A failure here does not lose the
  // report (it is already saved) — it just ends up without images.
  try {
    const archivos = formData.getAll("imagenes").filter((f): f is File => f instanceof File);
    const validas = archivos.filter((f) => isValidImage(f)).slice(0, MAX_ATTACHMENTS);
    const adjuntos: Attachment[] = [];
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

  // Internal alert to IT (configured at /ti/correo). SMTP/Graph delivery can take
  // seconds, so it is deferred with after(): the employee sees their confirmation
  // instantly and the email goes out after the response. It neither blocks nor
  // breaks creation if the email fails — the ticket is already saved.
  after(async () => {
    try {
      const c = await getEmailConfig(sb);
      if (notifiesOnNewTicket(c)) {
        const base = c.sitio_url?.replace(/\/+$/, "");
        const categoriaTexto =
          PORTAL_CATEGORIES.find((x) => x.value === categoria)?.titulo ?? categoria!;
        await sendNewTicketAlert(c, sb, {
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
