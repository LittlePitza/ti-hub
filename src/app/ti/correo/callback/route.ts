import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { getEmailConfig, exchangeCode } from "@/lib/domain/email";

// Return leg of "Sign in with Microsoft": Microsoft redirects here with a code.
// We verify the state, exchange the code for a refresh token and store it.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorMs = url.searchParams.get("error_description") || url.searchParams.get("error");

  const destino = (qs: string) => NextResponse.redirect(new URL(`/ti/correo?${qs}`, url.origin));

  if (errorMs)
    return destino(`prueba=oautherror&detail=${encodeURIComponent(errorMs.slice(0, 400))}`);
  if (!code) return destino("prueba=oautherror");

  const jar = await cookies();
  const esperado = jar.get("ms_oauth_state")?.value;
  jar.delete("ms_oauth_state");
  if (!state || !esperado || state !== esperado) return destino("prueba=oautherror&detail=state");

  const sb = await getAuthenticatedSupabase();
  if (!sb) return destino("prueba=oautherror");
  const c = await getEmailConfig(sb);
  if (!c?.azure_tenant_id || !c?.azure_client_id || !c?.azure_client_secret) {
    return destino("prueba=oauthfalta");
  }

  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
    const proto =
      request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const redirectUri = `${proto}://${host}/ti/correo/callback`;
    const { refresh_token, cuenta } = await exchangeCode(c, code, redirectUri);
    await sb
      .from("config_correo")
      .update({
        oauth_refresh_token: refresh_token,
        oauth_cuenta: cuenta || null,
        metodo: "oauth_interactivo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    return destino("conectado=1");
  } catch (e) {
    const detail = e instanceof Error ? e.message : "error";
    return destino(`prueba=oautherror&detail=${encodeURIComponent(detail.slice(0, 400))}`);
  }
}
