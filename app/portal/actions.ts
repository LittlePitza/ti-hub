"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabasePortal } from "@/lib/supabase";
import { COOKIE_PORTAL, CATEGORIAS_PORTAL, correoValido, getCorreoPortal } from "@/lib/portal";

const OPCIONES_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/portal",
};

export async function entrarPortal(formData: FormData) {
  const correo = ((formData.get("correo") as string) ?? "").trim().toLowerCase();
  if (!correoValido(correo)) redirect("/portal?error=correo");
  const jar = await cookies();
  jar.set(COOKIE_PORTAL, correo, { ...OPCIONES_COOKIE, maxAge: 60 * 60 * 24 * 180 });
  redirect("/portal");
}

export async function salirPortal() {
  const jar = await cookies();
  jar.set(COOKIE_PORTAL, "", { ...OPCIONES_COOKIE, maxAge: 0 });
  redirect("/portal");
}

export async function crearTicketPortal(formData: FormData) {
  const correo = await getCorreoPortal();
  if (!correo) redirect("/portal");
  const sb = getSupabasePortal();
  if (!sb) redirect("/portal?error=config");

  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  const titulo = v("titulo");
  if (!titulo) redirect("/portal/nuevo?error=resumen");
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

  const { data, error } = await sb
    .from("tickets")
    .insert({
      titulo,
      descripcion: v("descripcion"),
      categoria,
      solicitante: correo,
      solicitante_email: correo,
      equipo_id: equipoId,
      prioridad: "media", // TI la ajusta desde el panel; el empleado no ve prioridades
    })
    .select("num")
    .single();
  if (error || !data) redirect("/portal/nuevo?error=guardar");

  revalidatePath("/portal");
  revalidatePath("/tickets");
  revalidatePath("/");
  redirect(`/portal?creado=${data.num}`);
}
