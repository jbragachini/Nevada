"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { inicioDe } from "@/lib/sesion";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

export type AuthResult = { ok: false; error?: string; fieldErrors?: Record<string, string> };

const SIN_BASE = "El ingreso se habilita cuando se conecte la base de datos.";

const ingresoSchema = z.object({
  usuario: z.string().trim().min(3, "Ingresá tu usuario o mail").max(254),
  password: z.string().min(1, "Ingresá tu contraseña").max(200),
});

/** Ingreso con usuario o mail y contraseña. El mismo mensaje para cualquier dato incorrecto. */
export async function ingresar(input: unknown): Promise<AuthResult> {
  const supabase = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!supabase || !admin) return { ok: false, error: SIN_BASE };

  const parsed = ingresoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: errores(parsed.error) };

  let email = parsed.data.usuario.trim().toLowerCase();
  if (!email.includes("@")) {
    const { data } = await admin.rpc("email_de_usuario", { p_usuario: email });
    email = typeof data === "string" ? data : "";
  }

  const { data, error } = email
    ? await supabase.auth.signInWithPassword({ email, password: parsed.data.password })
    : { data: null, error: new Error("sin usuario") };
  if (error || !data?.user) {
    if (error && "status" in error && error.status === 429) {
      return { ok: false, error: "Demasiados intentos. Esperá unos minutos y volvé a probar." };
    }
    return { ok: false, error: "Usuario o contraseña incorrectos." };
  }

  const { data: perfil } = await supabase.from("profiles").select("rol").eq("id", data.user.id).maybeSingle();
  if (!perfil) {
    await supabase.auth.signOut();
    return { ok: false, error: "Tu usuario no tiene acceso a la plataforma." };
  }
  // El admin pasa siempre por la doble verificación.
  redirect(perfil.rol === "admin" ? "/ingresar/verificacion" : inicioDe(perfil));
}

// ───────── Doble verificación (TOTP) del admin ─────────

const codigoSchema = z.string().trim().regex(/^\d{6}$/, "Son 6 números");

async function sesionAdmin() {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: perfil } = await supabase.from("profiles").select("rol,activo").eq("id", data.user.id).maybeSingle();
  return perfil?.rol === "admin" && perfil.activo ? supabase : null;
}

export type AltaResult =
  | { ok: true; factorId: string; qr: string; secreto: string }
  | { ok: false; error: string };

/** Empieza el alta de la app autenticadora: devuelve el QR para escanear. */
export async function iniciarAlta(): Promise<AltaResult> {
  const supabase = await sesionAdmin();
  if (!supabase) return { ok: false, error: "Volvé a ingresar con tu usuario y contraseña." };
  // Limpia altas que quedaron a medias para que no se acumulen.
  const { data: factores } = await supabase.auth.mfa.listFactors();
  if (factores?.totp.length) return { ok: false, error: "Ya tenés la doble verificación activada." };
  for (const f of factores?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Nevada admin" });
  if (error || !data) {
    console.error("mfa enroll:", error?.message);
    return { ok: false, error: "No pudimos generar el código. Probá de nuevo." };
  }
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
}

/** Confirma el alta con el primer código de la app y deja la sesión verificada. */
export async function confirmarAlta(factorId: string, codigo: string): Promise<AuthResult> {
  const supabase = await sesionAdmin();
  if (!supabase) return { ok: false, error: "Volvé a ingresar con tu usuario y contraseña." };
  const c = codigoSchema.safeParse(codigo);
  if (!c.success) return { ok: false, fieldErrors: { codigo: "Son 6 números" } };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c.data });
  if (error) return { ok: false, fieldErrors: { codigo: "Ese código no es correcto o ya venció. Probá con el que muestra ahora la app." } };
  redirect("/admin");
}

/** Pide el código de la app en cada ingreso del admin. */
export async function verificarCodigo(codigo: string): Promise<AuthResult> {
  const supabase = await sesionAdmin();
  if (!supabase) return { ok: false, error: "Volvé a ingresar con tu usuario y contraseña." };
  const c = codigoSchema.safeParse(codigo);
  if (!c.success) return { ok: false, fieldErrors: { codigo: "Son 6 números" } };
  const { data: factores } = await supabase.auth.mfa.listFactors();
  const factor = factores?.totp[0];
  if (!factor) return { ok: false, error: "Todavía no activaste la doble verificación." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: c.data });
  if (error) {
    if ("status" in error && error.status === 429) {
      return { ok: false, error: "Demasiados intentos. Esperá unos minutos y volvé a probar." };
    }
    return { ok: false, fieldErrors: { codigo: "Ese código no es correcto o ya venció. Probá con el que muestra ahora la app." } };
  }
  redirect("/admin");
}

const accesoSchema = z.object({
  nombre: z.string().trim().min(5, "Ingresá tu nombre y apellido").max(80).regex(/\S+\s+\S+/, "Ingresá tu nombre y apellido"),
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,30}$/, "Entre 3 y 30 letras, números, punto o guion, sin espacios"),
  email: z.string().trim().toLowerCase().max(254).email("Revisá el correo electrónico"),
  whatsapp: z.string().trim().regex(/^[0-9+\s()-]{8,20}$/, "Revisá el número de WhatsApp"),
  password: z
    .string()
    .min(8, "Usá al menos 8 caracteres")
    .max(72, "Usá hasta 72 caracteres"),
});

/**
 * Un RRPP pide acceso: se crea su usuario (la contraseña la guarda Supabase Auth con hash), su perfil
 * INACTIVO y el pedido de acceso pendiente. Hasta que el admin lo aprueba no ve nada.
 */
export async function pedirAcceso(input: unknown): Promise<AuthResult> {
  const supabase = await getServerSupabase();
  const admin = getAdminSupabase();
  if (!supabase || !admin) return { ok: false, error: SIN_BASE };

  const parsed = accesoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: errores(parsed.error) };
  const d = parsed.data;

  // Freno anti abuso: si llegan muchos pedidos de acceso juntos, se pausa unos minutos.
  const { count: recientes } = await admin
    .from("access_requests")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente")
    .gte("creado_en", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((recientes ?? 0) >= 10) {
    return { ok: false, error: "Hay muchos pedidos de acceso en este momento. Probá de nuevo en unos minutos." };
  }

  const { data: existe } = await admin.from("profiles").select("id").eq("usuario", d.usuario).maybeSingle();
  if (existe) return { ok: false, fieldErrors: { usuario: "Ese usuario ya existe. Elegí otro." } };

  const { data: creado, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { nombre: d.nombre },
  });
  if (error || !creado.user) {
    const msg = error?.message ?? "";
    if (/already|registered|exists/i.test(msg)) {
      return { ok: false, fieldErrors: { email: "Ese mail ya tiene una cuenta. Probá ingresar." } };
    }
    if (/password/i.test(msg)) {
      return { ok: false, fieldErrors: { password: "Esa contraseña no es segura. Probá con otra." } };
    }
    console.error("pedirAcceso:", msg);
    return { ok: false, error: "No pudimos crear tu usuario. Probá de nuevo en un momento." };
  }

  const userId = creado.user.id;
  const { error: perfilError } = await admin
    .from("profiles")
    .insert({ id: userId, nombre: d.nombre, usuario: d.usuario, rol: "rrpp", activo: false });
  const { error: pedidoError } = perfilError
    ? { error: perfilError }
    : await admin.from("access_requests").insert({ profile_id: userId, whatsapp: d.whatsapp });
  if (perfilError || pedidoError) {
    // Sin perfil el usuario no sirve: se borra para que pueda volver a intentar.
    await admin.auth.admin.deleteUser(userId);
    if ((perfilError ?? pedidoError)?.code === "23505") {
      return { ok: false, fieldErrors: { usuario: "Ese usuario ya existe. Elegí otro." } };
    }
    console.error("pedirAcceso:", (perfilError ?? pedidoError)?.message);
    return { ok: false, error: "No pudimos crear tu usuario. Probá de nuevo en un momento." };
  }

  await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
  redirect("/rrpp");
}

export async function salir(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase?.auth.signOut();
  redirect("/ingresar");
}

function errores(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}
