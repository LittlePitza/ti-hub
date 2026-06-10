import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Bloquea el panel de TI: sin sesión de Supabase Auth solo se puede ver /login.
// El portal del empleado (/portal) queda fuera del candado: ahí la identidad es
// la cookie de correo que maneja el propio portal, sin cuentas de Supabase.
// También refresca el token de sesión en cada petición (cookies).
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/portal")) return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Sin configuración (dev local) cada página muestra <SinConexion />.
  if (!url || !key) return NextResponse.next();

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valida el JWT contra Supabase; no confiar en getSession() aquí.
  const { data: { user } } = await supabase.auth.getUser();
  const enLogin = request.nextUrl.pathname.startsWith("/login");

  if (!user && !enLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  if (user && enLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = {
  // Todo excepto estáticos de Next y archivos públicos (íconos, imágenes).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
