import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/supabase/cookies";

/**
 * Refresca la sesión de Supabase en las páginas del personal (/ingresar, /rrpp, /admin) para que
 * las cookies no venzan mientras se usa el panel. Los permisos los decide cada página y la base.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, { ...options, ...cookieOptions });
        }
      },
    },
  });

  // getUser() valida el token con Supabase y, si hace falta, lo renueva.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/ingresar/:path*", "/rrpp/:path*", "/admin/:path*"],
  // Node completo: la librería de Supabase usa APIs de Node que el entorno Edge no tiene.
  runtime: "nodejs",
};
