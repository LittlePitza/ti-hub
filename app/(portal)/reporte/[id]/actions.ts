"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabasePortal } from "@/lib/supabase";
import { getCorreoPortal, nombreDeCorreo } from "@/lib/portal";
import { ESTADOS_RESUELTOS, esEstadoResuelto } from "@/lib/tickets";

// Respuesta del solicitante desde el portal: se guarda como evento `mensaje_cliente`,
// que TI ve en la bitácora y el empleado en su hilo. Si el reporte ya estaba archivado
// (o resuelto/cerrado), responder lo reabre para que vuelva a la bandeja activa de TI.
export async function responderTicketPortal(formData: FormData) {
  const correo = await getCorreoPortal();
  if (!correo) redirect("/");
  const id = (formData.get("id") as string)?.trim();
  const cuerpo = (formData.get("cuerpo") as string)?.trim();
  if (!id) redirect("/");
  if (!cuerpo) redirect(`/reporte/${id}`);

  const sb = getSupabasePortal();
  if (!sb) redirect(`/reporte/${id}`);

  // El reporte debe ser del propio empleado (la service role salta el RLS).
  const { data: t } = await sb
    .from("tickets")
    .select("id, estado")
    .eq("id", id)
    .eq("solicitante_email", correo)
    .maybeSingle();
  if (!t) redirect("/");

  const { data: empleado } = await sb
    .from("empleados")
    .select("nombre")
    .eq("correo", correo)
    .maybeSingle();
  const autor = empleado?.nombre || nombreDeCorreo(correo);

  const { error } = await sb.from("ticket_eventos").insert({
    ticket_id: id,
    tipo: "mensaje_cliente",
    autor,
    cuerpo,
  });
  if (error) {
    console.error("[portal] responder reporte:", error.message);
    redirect(`/reporte/${id}`);
  }

  // Reabrir si estaba archivado/resuelto: el cliente sigue necesitando ayuda.
  if (esEstadoResuelto(t.estado)) {
    await sb
      .from("tickets")
      .update({ estado: "reabierto", resuelto_at: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    await sb.from("ticket_eventos").insert({
      ticket_id: id,
      tipo: "estado",
      autor,
      cuerpo: "Reabierto por el solicitante al responder",
      estado_anterior: t.estado,
      estado_nuevo: "reabierto",
    });
  }

  revalidatePath(`/reporte/${id}`);
  revalidatePath("/");
  revalidatePath("/ti/tickets");
  revalidatePath("/ti");
  revalidatePath(`/ti/tickets/${id}`);
  redirect(`/reporte/${id}#fin`);
}
