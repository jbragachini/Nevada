import "server-only";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

export type Sesion = {
  userId: string;
  nombre: string;
  usuario: string;
  rol: "admin" | "rrpp";
  activo: boolean;
  /** Estado del pedido de acceso (RRPP nuevos). */
  acceso: "pendiente" | "aprobada" | "rechazada" | null;
  /** Ficha de vendedor; solo existe para un RRPP aprobado y activo. */
  seller: {
    id: string;
    codigo: string;
    nombrePublico: string;
    puedeCargarVentas: boolean;
    maxInvitados: number | null;
  } | null;
};

/** Usuario conectado con su perfil, o null. Todo se lee con su sesión (RLS). */
export async function getSesion(): Promise<Sesion | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: perfil }, { data: pedido }, { data: seller }] = await Promise.all([
    supabase.from("profiles").select("nombre,usuario,rol,activo").eq("id", user.id).maybeSingle(),
    supabase.from("access_requests").select("estado").eq("profile_id", user.id).maybeSingle(),
    supabase
      .from("sellers")
      .select("id,codigo,nombre_publico,puede_cargar_ventas,max_invitados")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  if (!perfil) return null;

  return {
    userId: user.id,
    nombre: perfil.nombre,
    usuario: perfil.usuario,
    rol: perfil.rol,
    activo: perfil.activo,
    acceso: pedido?.estado ?? null,
    seller: seller
      ? {
          id: seller.id,
          codigo: seller.codigo,
          nombrePublico: seller.nombre_publico,
          puedeCargarVentas: seller.puede_cargar_ventas,
          maxInvitados: seller.max_invitados,
        }
      : null,
  };
}

/** A dónde va cada usuario después de ingresar. */
export function inicioDe(s: Pick<Sesion, "rol">): string {
  return s.rol === "admin" ? "/admin" : "/rrpp";
}

/** Páginas del RRPP: sin sesión, al ingreso; el admin, a su panel. */
export async function requireRrpp(): Promise<Sesion> {
  const s = await getSesion();
  if (!s) redirect("/ingresar");
  if (s.rol === "admin") redirect("/admin");
  return s;
}

/** Nivel de verificación de la sesión: aal2 = ya pasó la doble verificación. */
export async function getNivel(): Promise<{ actual: string | null; siguiente: string | null }> {
  const supabase = await getServerSupabase();
  if (!supabase) return { actual: null, siguiente: null };
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { actual: data?.currentLevel ?? null, siguiente: data?.nextLevel ?? null };
}

/** Páginas del admin: además del rol, exige la doble verificación hecha en esta sesión. */
export async function requireAdmin(): Promise<Sesion> {
  const s = await getSesion();
  if (!s) redirect("/ingresar");
  if (s.rol !== "admin" || !s.activo) redirect("/rrpp");
  if ((await getNivel()).actual !== "aal2") redirect("/ingresar/verificacion");
  return s;
}
