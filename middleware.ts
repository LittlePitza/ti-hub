import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// El portal del empleado vive en la raíz (/) y es público: su identidad es la
// cookie de correo que maneja el propio portal, sin cuentas de Supabase.
// El panel de TI vive en /ti y exige sesión de Supabase Auth; /login es su puerta.
// También refresca el token de sesión en cada petición al panel (cookies).
export async function middleware(request: NextRequest) {
  const ruta = request.nextUrl.pathname;
  const esPanel = ruta.startsWith("/ti");
  const enLogin = ruta.startsWith("/login");
  if (!esPanel && !enLogin) return NextResponse.next();

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
  // Todo excepto estáticos de Next y archivos públicos (íconos, imágenes).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
