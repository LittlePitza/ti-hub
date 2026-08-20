"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPortalSupabase } from "@/lib/supabase/client";
import { getPortalEmail, nameFromEmail } from "@/lib/domain/portal";
import { isResolvedStatus } from "@/lib/domain/tickets";

// A reply from the requester through the portal: stored as a `mensaje_cliente`
// event, which IT sees in the activity log and the employee sees in their thread.
// If the report was already archived (or resolved/closed), replying reopens it so
// it returns to the active IT queue.
export async function replyFromPortal(formData: FormData) {
  const correo = await getPortalEmail();
  if (!correo) redirect("/");
  const id = (formData.get("id") as string)?.trim();
  const cuerpo = (formData.get("cuerpo") as string)?.trim();
  if (!id) redirect("/");
  if (!cuerpo) redirect(`/reporte/${id}`);

  const sb = getPortalSupabase();
  if (!sb) redirect(`/reporte/${id}`);

  // The report must belong to this employee (the service role bypasses RLS).
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
  const autor = empleado?.nombre || nameFromEmail(correo);

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

  // Reopen if it was archived or resolved: the requester still needs help.
  if (isResolvedStatus(t.estado)) {
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
