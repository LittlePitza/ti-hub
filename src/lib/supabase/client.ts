import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Every client is typed against the generated schema, so table names, column
// names and row shapes are checked at compile time. Regenerate types/database.ts
// after any schema change.
export type Supabase = SupabaseClient<Database>;

// Per-request client bound to the session cookies (Supabase Auth).
// Never use a singleton: the session differs on every request.
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
          // Server Components cannot write cookies; the middleware is the one
          // that refreshes the session.
        }
      },
    },
  });
}

// For server actions: returns the client only when there is an authenticated
// user. This is what stops the actions — public POST endpoints — from being
// invoked without a session.
// It uses getClaims(), which verifies the JWT locally with the project's
// asymmetric key and needs no round-trip to the Auth server, unlike getUser().
export async function getAuthenticatedSupabase(): Promise<Supabase | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getClaims();
  return data?.claims?.sub ? sb : null;
}

// Service-role client for the employee portal (which has no Supabase Auth).
// Use it ONLY in the portal's server code and ALWAYS filter by the employee
// email: the service-role key bypasses RLS and must never reach the client.
export function getPortalSupabase(): Supabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
