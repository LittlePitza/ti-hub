"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { getConfigCorreo, enviarPrueba, tieneCredenciales } from "@/lib/correo";

export async function guardarConfigCorreo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;

  const txt = (k: string) => (formData.get(k) as string)?.trim() || null;
  const activado = (k: string) => formData.get(k) === "on";

  const patch: Record<string, unknown> = {
    activo: activado("activo"),
    smtp_host: txt("smtp_host") || "smtp.office365.com",
    smtp_port: Number(formData.get("smtp_port")) || 587,
    smtp_user: txt("smtp_user"),
    remitente: txt("remitente"),
    remitente_nombre: txt("remitente_nombre") || "Soporte TI · Plásticos PIMSA",
    sitio_url: txt("sitio_url"),
    notif_respuesta_def: activado("notif_respuesta_def"),
    notif_estado_def: activado("notif_estado_def"),
    asunto_respuesta: txt("asunto_respuesta") || "Respuesta a tu reporte {{folio}}",
    cuerpo_respuesta: txt("cuerpo_respuesta") || "Hola {{nombre}},\n\n{{mensaje}}",
    asunto_estado: txt("asunto_estado") || "Tu reporte {{folio}} ahora está: {{estado}}",
    cuerpo_estado: txt("cuerpo_estado") || "Hola {{nombre}},\n\nTu reporte {{folio}} cambió a: {{estado}}.",
    updated_at: new Date().toISOString(),
  };

  // La contraseña solo se actualiza si se escribió una nueva (vacío = conservar la
  // guardada). Así no hay que reescribirla en cada cambio ni se muestra en el form.
  const pass = (formData.get("smtp_pass") as string) ?? "";
  if (pass.length > 0) patch.smtp_pass = pass;

  await sb.from("config_correo").update(patch).eq("id", 1);
  revalidatePath("/ti/correo");
  revalidatePath("/ti/tickets");
  redirect("/ti/correo?guardado=1");
}

export async function enviarPruebaCorreo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const para = (formData.get("para") as string)?.trim();
  if (!para) redirect("/ti/correo?prueba=falta");

  const c = await getConfigCorreo(sb);
  if (!tieneCredenciales(c)) redirect("/ti/correo?prueba=sincreds");

  const r = await enviarPrueba(c, para);
  redirect(`/ti/correo?prueba=${r.ok ? "ok" : "error"}`);
}
