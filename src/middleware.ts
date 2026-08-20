import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// The employee portal lives at the root (/) and is public: its identity is the
// email cookie the portal itself manages, with no Supabase account involved.
// The IT panel lives at /ti and requires a Supabase Auth session; /login is its
// door. This also refreshes the session token on every request to the panel.
export async function middleware(request: NextRequest) {
  const ruta = request.nextUrl.pathname;
  const esPanel = ruta.startsWith("/ti");
  const enLogin = ruta.startsWith("/login");
  if (!esPanel && !enLogin) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // With no configuration (local dev) every page renders <NoConnection />.
  if (!url || !key) return NextResponse.next();

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          respuesta.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() validates the JWT against Supabase; getSession() cannot be trusted
  // here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && esPanel) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  if (user && enLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/ti";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = {
  // Only the panel and its front door: the employee portal (/) is public and
  // does not need to pass through here. The middleware used to run on every
  // route and simply return early; narrowing the matcher keeps it out of portal
  // traffic altogether.
  matcher: ["/ti/:path*", "/login"],
};
