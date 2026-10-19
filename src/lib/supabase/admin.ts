import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente del servidor con la clave service_role: saltea RLS, así que solo se usa en código de
 * servidor y para llamar a las funciones de la base que hacen sus propios controles
 * (crear_pedido_web, pedido_por_token). Nunca llega al navegador.
 * Devuelve null si Supabase todavía no está configurado.
 */
export function getAdminSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
