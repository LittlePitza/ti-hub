import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Every client is typed against the generated schema, so table names, column
// names and row shapes are checked at compile time. Regenerate types/database.ts
// after any schema change.
export type Supabase = SupabaseClient<Database>;

// Cliente por petición ligado a las cookies de sesión (Supabase Auth).
// Nunca usar un singleton: la sesión es distinta en cada petición.
export async function getSupabase(): Promise<Supabase | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Los server components no pueden escribir cookies;
          // el middleware se encarga de refrescar la sesión.
        }
      },
    },
  });
}

// Para server actions: regresa el cliente solo si hay un usuario autenticado.
// Evita que las actions (endpoints POST públicos) se invoquen sin sesión.
// Usa getClaims() (verifica el JWT localmente con la llave asimétrica del proyecto,
// sin viaje de red al servidor de Auth) en vez de getUser() (que siempre llama por red).
export async function getSupabaseAutenticado(): Promise<Supabase | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getClaims();
  return data?.claims?.sub ? sb : null;
}

// Cliente con service role key para el portal del empleado (sin Supabase Auth).
// SOLO usarlo en código de servidor del portal, siempre filtrando por el correo
// del empleado: la service role key salta el RLS y jamás debe llegar al cliente.
export function getSupabasePortal(): Supabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
