"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export async function iniciarSesion(formData: FormData) {
  const sb = await getSupabase();
  if (!sb) redirect("/login?error=config");

  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";
  if (!email || !password) redirect("/login?error=credenciales");

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credenciales");
  redirect("/");
}

export async function cerrarSesion() {
  const sb = await getSupabase();
  if (sb) await sb.auth.signOut();
  redirect("/login");
}
