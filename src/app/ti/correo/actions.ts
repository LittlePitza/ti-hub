"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";
import type { TablesUpdate } from "@/types/database";
import {
  getEmailConfig,
  sendTestEmail,
  hasCredentials,
  authorizationUrl,
  type EmailMethod,
} from "@/lib/domain/email";

const METODOS: EmailMethod[] = ["smtp_basico", "graph_app", "oauth_interactivo"];

// Absolute URL of this deployment, derived from the proxy headers (Vercel).
async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function saveEmailConfig(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;

  const txt = reader(formData);
  const activado = (k: string) => formData.get(k) === "on";
  const metodoRaw = (formData.get("metodo") as string) ?? "smtp_basico";
  const metodo = METODOS.includes(metodoRaw as EmailMethod) ? metodoRaw : "smtp_basico";

  // Converts an hours field to a positive integer or null (null = use the default).
  const horas = (k: string): number | null => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  };
  const pct = (k: string, def: number): number => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 1 && v <= 99 ? Math.round(v) : def;
  };

  const patch: TablesUpdate<"config_correo"> = {
    activo: activado("activo"),
    metodo,
    smtp_host: txt("smtp_host") || "smtp.office365.com",
    smtp_port: Number(formData.get("smtp_port")) || 587,
    smtp_user: txt("smtp_user"),
    azure_tenant_id: txt("azure_tenant_id"),
    azure_client_id: txt("azure_client_id"),
    remitente: txt("remitente"),
    remitente_nombre: txt("remitente_nombre") || "Soporte TI · Plásticos PIMSA",
    sitio_url: txt("sitio_url"),
    notif_respuesta_def: activado("notif_respuesta_def"),
    notif_estado_def: activado("notif_estado_def"),
    notif_nuevo: activado("notif_nuevo"),
    notif_nuevo_destinos: txt("notif_nuevo_destinos"),
    asunto_respuesta: txt("asunto_respuesta") || "Respuesta a tu reporte {{folio}}",
    cuerpo_respuesta: txt("cuerpo_respuesta") || "Hola {{nombre}},\n\n{{mensaje}}",
    asunto_estado: txt("asunto_estado") || "Tu reporte {{folio}} ahora está: {{estado}}",
    cuerpo_estado:
      txt("cuerpo_estado") || "Hola {{nombre}},\n\nTu reporte {{folio}} cambió a: {{estado}}.",
    asunto_nuevo: txt("asunto_nuevo") || "Nuevo reporte {{folio}} · {{titulo}}",
    cuerpo_nuevo:
      txt("cuerpo_nuevo") ||
      "Nuevo reporte de {{solicitante}}.\n\nFolio: {{folio}}\nAsunto: {{titulo}}\nCategoría: {{categoria}}\n\n{{descripcion}}",
    // Configurable SLA (null = the code default).
    sla_critica_respuesta: horas("sla_critica_respuesta"),
    sla_critica_resolucion: horas("sla_critica_resolucion"),
    sla_alta_respuesta: horas("sla_alta_respuesta"),
    sla_alta_resolucion: horas("sla_alta_resolucion"),
    sla_media_respuesta: horas("sla_media_respuesta"),
    sla_media_resolucion: horas("sla_media_resolucion"),
    sla_baja_respuesta: horas("sla_baja_respuesta"),
    sla_baja_resolucion: horas("sla_baja_resolucion"),
    sla_por_vencer_pct: pct("sla_por_vencer_pct", 80),
    updated_at: new Date().toISOString(),
  };

  // Secrets: only updated when a new one was typed (empty = keep the stored one).
  // That way they need not be retyped on every change, and are never shown in the
  // form.
  const pass = (formData.get("smtp_pass") as string) ?? "";
  if (pass.length > 0) patch.smtp_pass = pass;
  const secret = (formData.get("azure_client_secret") as string) ?? "";
  if (secret.length > 0) patch.azure_client_secret = secret;

  const { error } = await sb.from("config_correo").update(patch).eq("id", 1);
  if (error) {
    console.error("[correo] guardar configuración:", error.message);
    redirect("/ti/correo?guardado=0");
  }
  revalidatePath("/ti/correo");
  revalidatePath("/ti/tickets");
  redirect("/ti/correo?guardado=1");
}

// Starts the "Sign in with Microsoft" flow: sets an anti-CSRF state cookie and
// sends the admin to the Microsoft page. On the way back, the callback stores the
// token.
export async function connectMicrosoft() {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const c = await getEmailConfig(sb);
  if (!c?.azure_tenant_id || !c?.azure_client_id || !c?.azure_client_secret) {
    redirect("/ti/correo?prueba=oauthfalta");
  }

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set("ms_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 600,
    path: "/ti/correo",
  });
  const redirectUri = `${await baseUrl()}/ti/correo/callback`;
  redirect(authorizationUrl(c!, redirectUri, state));
}

// Disconnects the Microsoft account (deletes the stored refresh token).
export async function disconnectMicrosoft() {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("config_correo")
    .update({ oauth_refresh_token: null, oauth_cuenta: null })
    .eq("id", 1);
  if (error) {
    console.error("[correo] desconectar Microsoft:", error.message);
    return;
  }
  revalidatePath("/ti/correo");
  redirect("/ti/correo?desconectado=1");
}

export async function sendTestMessage(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const para = (formData.get("para") as string)?.trim();
  if (!para) redirect("/ti/correo?prueba=falta");

  const c = await getEmailConfig(sb);
  if (!hasCredentials(c)) redirect("/ti/correo?prueba=sincreds");

  const r: { ok: boolean; detail?: string } = await sendTestEmail(c, sb, para);
  // Passes the raw Microsoft error (the 535…) through to the panel so it can be
  // diagnosed without opening the server logs. Truncated so the URL stays small.
  const detail = !r.ok && r.detail ? `&detail=${encodeURIComponent(r.detail.slice(0, 400))}` : "";
  redirect(`/ti/correo?prueba=${r.ok ? "ok" : "error"}${detail}`);
}
