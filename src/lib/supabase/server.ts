import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/supabase/cookies";

/**
 * Cliente con la sesión del usuario (RRPP o admin), leída de las cookies.
 * Usa la clave pública: todo lo que lee o escribe pasa por RLS como ese usuario.
 * Devuelve null si Supabase todavía no está configurado.
 */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const store = await cookies();
  return createServerClient(url, anon, {
    cookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, ...cookieOptions });
        } catch {
          // En un Server Component no se pueden escribir cookies: el middleware ya refrescó la sesión.
        }
      },
    },
  });
}
