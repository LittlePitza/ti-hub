"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { lector } from "@/lib/form";
import {
  getConfigCorreo,
  enviarPrueba,
  tieneCredenciales,
  urlAutorizacion,
  type MetodoCorreo,
} from "@/lib/correo";

const METODOS: MetodoCorreo[] = ["smtp_basico", "graph_app", "oauth_interactivo"];

// URL absoluta de esta instalación, a partir de las cabeceras del proxy (Vercel).
async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function guardarConfigCorreo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;

  const txt = lector(formData);
  const activado = (k: string) => formData.get(k) === "on";
  const metodoRaw = (formData.get("metodo") as string) ?? "smtp_basico";
  const metodo = METODOS.includes(metodoRaw as MetodoCorreo) ? metodoRaw : "smtp_basico";

  // Convierte un campo de horas a número entero positivo o null (null = usar predeterminado).
  const horas = (k: string): number | null => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  };
  const pct = (k: string, def: number): number => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 1 && v <= 99 ? Math.round(v) : def;
  };

  const patch: Record<string, unknown> = {
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
    cuerpo_estado: txt("cuerpo_estado") || "Hola {{nombre}},\n\nTu reporte {{folio}} cambió a: {{estado}}.",
    asunto_nuevo: txt("asunto_nuevo") || "Nuevo reporte {{folio}} · {{titulo}}",
    cuerpo_nuevo:
      txt("cuerpo_nuevo") ||
      "Nuevo reporte de {{solicitante}}.\n\nFolio: {{folio}}\nAsunto: {{titulo}}\nCategoría: {{categoria}}\n\n{{descripcion}}",
    // SLA configurable (null = predeterminado del código).
    sla_critica_respuesta:  horas("sla_critica_respuesta"),
    sla_critica_resolucion: horas("sla_critica_resolucion"),
    sla_alta_respuesta:     horas("sla_alta_respuesta"),
    sla_alta_resolucion:    horas("sla_alta_resolucion"),
    sla_media_respuesta:    horas("sla_media_respuesta"),
    sla_media_resolucion:   horas("sla_media_resolucion"),
    sla_baja_respuesta:     horas("sla_baja_respuesta"),
    sla_baja_resolucion:    horas("sla_baja_resolucion"),
    sla_por_vencer_pct:     pct("sla_por_vencer_pct", 80),
    updated_at: new Date().toISOString(),
  };

  // Secretos: solo se actualizan si se escribió uno nuevo (vacío = conservar el
  // guardado). Así no hay que reescribirlos en cada cambio ni se muestran en el form.
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

// Inicia el flujo "Iniciar sesión con Microsoft": fija un state anti-CSRF en cookie
// y manda al admin a la página de Microsoft. Al volver, el callback guarda el token.
export async function conectarMicrosoft() {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const c = await getConfigCorreo(sb);
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
  redirect(urlAutorizacion(c!, redirectUri, state));
}

// Desconecta la cuenta de Microsoft (borra el refresh token guardado).
export async function desconectarMicrosoft() {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const { error } = await sb.from("config_correo").update({ oauth_refresh_token: null, oauth_cuenta: null }).eq("id", 1);
  if (error) {
    console.error("[correo] desconectar Microsoft:", error.message);
    return;
  }
  revalidatePath("/ti/correo");
  redirect("/ti/correo?desconectado=1");
}

export async function enviarPruebaCorreo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const para = (formData.get("para") as string)?.trim();
  if (!para) redirect("/ti/correo?prueba=falta");

  const c = await getConfigCorreo(sb);
  if (!tieneCredenciales(c)) redirect("/ti/correo?prueba=sincreds");

  const r: { ok: boolean; detalle?: string } = await enviarPrueba(c, sb, para);
  // Pasa el error crudo de Microsoft (el 535 …) al panel para diagnosticar sin
  // tener que abrir los logs del servidor. Se recorta para no inflar la URL.
  const detalle = !r.ok && r.detalle
    ? `&detalle=${encodeURIComponent(r.detalle.slice(0, 400))}`
    : "";
  redirect(`/ti/correo?prueba=${r.ok ? "ok" : "error"}${detalle}`);
}
