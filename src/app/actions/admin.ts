"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COOKIE_EVENTO } from "@/lib/admin";
import { getSesion } from "@/lib/sesion";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Acciones del admin. Cada una vuelve a verificar la sesión y llama a una función admin_* de la base,
 * que verifica de nuevo que sea admin, aplica las reglas y deja todo en la auditoría.
 */

export type Respuesta = { ok: true; mensaje?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const GENERICO = "No pudimos guardar. Probá de nuevo en un momento.";

async function adminDb() {
  const sesion = await getSesion();
  if (!sesion || sesion.rol !== "admin" || !sesion.activo) return null;
  return getServerSupabase();
}

function traducir(message: string, detail: string | null): string {
  const codigo = message.startsWith("NEV:") ? message.slice(4) : null;
  switch (codigo) {
    case "sin_permiso":
      return "Tu sesión no tiene permiso de admin. Volvé a ingresar.";
    case "no_existe":
      return "Ya no existe. Recargá la página.";
    case "evento_con_ventas":
      return "Este evento tiene ventas: no se puede eliminar. Podés sacarlo de la página y cerrar sus ventas.";
    case "cupo_menor_que_vendido":
      return `El cupo no puede quedar por debajo de lo vendido o reservado (${detail}).`;
    case "estado_invalido":
      return "Este pedido ya no está esperando aprobación. Recargá la página.";
    case "supera_pendiente":
      return `No se puede pagar más que la comisión pendiente ($${Number(detail).toLocaleString("es-AR")}).`;
    case "supera_deuda":
      return `Es más de lo que debe rendir en ${detail}.`;
    case "monto_invalido":
      return "Ingresá un monto mayor a cero.";
    default:
      if (/events_clave_si_hace_falta/.test(message)) return "Para usar palabra clave, escribí la palabra.";
      if (/clave_acceso/.test(message)) return "La palabra clave tiene que tener entre 4 y 40 caracteres.";
      if (/sellers_codigo_key|duplicate key.*codigo/.test(message)) return "Ese código de link ya lo usa otro RRPP.";
      if (/event_guests_event_id_email_key/.test(message)) return "Ese mail ya está en la lista de invitados.";
      if (/check constraint/.test(message)) return "Revisá los datos: hay un valor fuera de rango.";
      console.error("admin:", message);
      return GENERICO;
  }
}

async function llamar(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: string | null }> {
  const supabase = await adminDb();
  if (!supabase) return { data: null, error: "Tu sesión no tiene permiso de admin. Volvé a ingresar." };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: traducir(error.message, error.details) };
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  return { data, error: null };
}

function errores(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const uuid = z.string().uuid();

// ───────── Evento actual ─────────
export async function elegirEvento(id: string): Promise<void> {
  if (!uuid.safeParse(id).success) return;
  (await cookies()).set(COOKIE_EVENTO, id, { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 60 * 60 * 24 * 90 });
  revalidatePath("/admin", "layout");
}

// ───────── Eventos ─────────
const eventoSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresá el nombre").max(120),
  subtitulo: z.string().trim().max(120).optional().default(""),
  fecha_inicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Elegí fecha y hora")
    .transform((v) => `${v}:00-03:00`),
  lugar: z.string().trim().min(2, "Ingresá el lugar").max(120),
  direccion: z.string().trim().max(200).optional().default(""),
  ciudad: z.string().trim().min(2, "Ingresá la ciudad").max(120),
  descripcion: z.string().trim().max(2000).optional().default(""),
});

export async function crearEvento(datos: Record<string, unknown>): Promise<Respuesta> {
  const p = eventoSchema.safeParse(datos);
  if (!p.success) return { ok: false, error: "Revisá los datos del evento.", fieldErrors: errores(p.error) };
  const r = await llamar("admin_crear_evento", { p: p.data });
  if (r.error) return { ok: false, error: r.error };
  await elegirEvento(String(r.data));
  redirect(`/admin/eventos/${String(r.data)}`);
}

const accesoSchema = z
  .object({
    acceso: z.enum(["publico", "lista", "clave"]),
    clave_acceso: z.string().trim().max(40).optional().default(""),
    mostrar_rrpp: z.boolean(),
  })
  .refine((d) => d.acceso !== "clave" || d.clave_acceso.length >= 4, {
    message: "La palabra clave tiene que tener al menos 4 caracteres",
    path: ["clave_acceso"],
  });

export async function editarEvento(id: string, datos: Record<string, unknown>): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const d = eventoSchema.safeParse(datos);
  const a = accesoSchema.safeParse(datos);
  if (!d.success || !a.success) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: { ...(d.success ? {} : errores(d.error)), ...(a.success ? {} : errores(a.error)) },
    };
  }
  const r = await llamar("admin_editar_evento", { p_id: id, p: { ...d.data, ...a.data } });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Cambios guardados." };
}

export async function estadoEvento(id: string, publicado: boolean | null, ventasAbiertas: boolean | null): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_estado_evento", { p_id: id, p_publicado: publicado, p_ventas_abiertas: ventasAbiertas });
  return r.error ? { ok: false, error: r.error } : { ok: true };
}

export async function duplicarEvento(id: string): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_duplicar_evento", { p_id: id });
  if (r.error) return { ok: false, error: r.error };
  redirect(`/admin/eventos/${String(r.data)}`);
}

export async function eliminarEvento(id: string): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_eliminar_evento", { p_id: id });
  if (r.error) return { ok: false, error: r.error };
  redirect("/admin/eventos");
}

// ───────── Tipos de entrada ─────────
const tipoSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre").max(60),
  descripcion: z.string().trim().max(200).optional().default(""),
  precio: z.coerce.number({ message: "Ingresá el precio" }).int("Sin centavos").min(0, "No puede ser negativo"),
  cupo_total: z.coerce.number({ message: "Ingresá el cupo" }).int().min(0, "No puede ser negativo"),
  comision_rrpp: z.coerce.number().int().min(0, "No puede ser negativa"),
  max_por_compra: z.coerce.number().int().min(1, "Al menos 1").max(50, "Hasta 50"),
  en_venta: z.boolean(),
});

export async function guardarTipo(id: string | null, eventId: string, datos: Record<string, unknown>): Promise<Respuesta> {
  if ((id && !uuid.safeParse(id).success) || !uuid.safeParse(eventId).success) return { ok: false, error: GENERICO };
  const p = tipoSchema.safeParse(datos);
  if (!p.success) return { ok: false, error: "Revisá los datos marcados.", fieldErrors: errores(p.error) };
  const r = await llamar("admin_guardar_tipo", { p_id: id, p_event_id: eventId, p: p.data });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: id ? "Guardado." : "Tipo agregado." };
}

export async function borrarTipo(id: string): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_borrar_tipo", { p_id: id });
  if (r.error) return { ok: false, error: r.error };
  return {
    ok: true,
    mensaje: r.data === "sin_venta" ? "Tiene ventas: no se borra, quedó «no a la venta»." : "Tipo borrado.",
  };
}

// ───────── Pedidos y entradas ─────────
export async function aprobarPedido(id: string): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_aprobar_pedido", { p_id: id });
  if (r.error) return { ok: false, error: r.error };
  const n = Number(r.data);
  return { ok: true, mensaje: `Aprobado: ${n} entrada${n === 1 ? "" : "s"} con QR.` };
}

export async function rechazarPedido(id: string, motivo: string): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_rechazar_pedido", { p_id: id, p_motivo: motivo.slice(0, 500) });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Rechazado." };
}

export async function anularEntrada(id: string, motivo: string): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_anular_entrada", { p_id: id, p_motivo: motivo.slice(0, 500) });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Entrada anulada." };
}

// ───────── RRPP y accesos ─────────
const codigoSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,30}$/, "Entre 2 y 30 letras, números o guiones");
const topeSchema = z
  .union([z.literal(""), z.coerce.number().int().min(0).max(1000)])
  .transform((v) => (v === "" ? null : v));

export async function aprobarAcceso(id: string, datos: Record<string, unknown>): Promise<Respuesta> {
  const p = z
    .object({ codigo: codigoSchema, puede_cargar: z.boolean(), max_invitados: topeSchema })
    .safeParse(datos);
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  if (!p.success) return { ok: false, error: "Revisá el código de link.", fieldErrors: errores(p.error) };
  const r = await llamar("admin_aprobar_acceso", {
    p_request_id: id,
    p_codigo: p.data.codigo,
    p_puede_cargar: p.data.puede_cargar,
    p_max_invitados: p.data.max_invitados,
  });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Acceso aprobado." };
}

export async function rechazarAcceso(id: string): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const r = await llamar("admin_rechazar_acceso", { p_request_id: id });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Pedido rechazado." };
}

export async function editarRrpp(id: string, datos: Record<string, unknown>): Promise<Respuesta> {
  if (!uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const p = z
    .object({
      activo: z.boolean().optional(),
      puede_cargar_ventas: z.boolean().optional(),
      max_invitados: topeSchema.optional(),
      nombre_publico: z.string().trim().min(2).max(80).optional(),
      codigo: codigoSchema.optional(),
    })
    .safeParse(datos);
  if (!p.success) return { ok: false, error: "Revisá los datos.", fieldErrors: errores(p.error) };
  const r = await llamar("admin_editar_rrpp", { p_seller_id: id, p: p.data });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Guardado." };
}

// ───────── Plata con los RRPP ─────────
const pesos = z.coerce.number({ message: "Ingresá un monto" }).int("Sin centavos").min(0, "No puede ser negativo");

export async function pagarComision(sellerId: string, datos: Record<string, unknown>): Promise<Respuesta> {
  const p = z
    .object({ monto: pesos, medio: z.enum(["efectivo", "transferencia"]), nota: z.string().max(500).optional().default("") })
    .safeParse(datos);
  if (!uuid.safeParse(sellerId).success) return { ok: false, error: GENERICO };
  if (!p.success) return { ok: false, error: "Revisá el monto.", fieldErrors: errores(p.error) };
  const r = await llamar("admin_pagar_comision", {
    p_seller_id: sellerId,
    p_monto: p.data.monto,
    p_medio: p.data.medio,
    p_nota: p.data.nota,
  });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Pago registrado." };
}

export async function registrarRendicion(sellerId: string, datos: Record<string, unknown>): Promise<Respuesta> {
  const p = z
    .object({ efectivo: pesos, transferencia: pesos, nota: z.string().max(500).optional().default("") })
    .safeParse(datos);
  if (!uuid.safeParse(sellerId).success) return { ok: false, error: GENERICO };
  if (!p.success) return { ok: false, error: "Revisá los montos.", fieldErrors: errores(p.error) };
  const r = await llamar("admin_registrar_rendicion", {
    p_seller_id: sellerId,
    p_efectivo: p.data.efectivo,
    p_transferencia: p.data.transferencia,
    p_nota: p.data.nota,
  });
  return r.error ? { ok: false, error: r.error } : { ok: true, mensaje: "Rendición registrada." };
}

// ───────── Invitados de Nevada ─────────
export async function agregarInvitadoAdmin(eventId: string, datos: Record<string, unknown>): Promise<Respuesta> {
  const p = z
    .object({
      nombre: z.string().trim().min(2, "Ingresá el nombre").max(120),
      email: z.string().trim().toLowerCase().max(254).email("Revisá el mail"),
      max_entradas: z.coerce.number().int().min(1, "Al menos 1").max(20, "Hasta 20"),
    })
    .safeParse(datos);
  if (!uuid.safeParse(eventId).success) return { ok: false, error: GENERICO };
  if (!p.success) return { ok: false, error: "Revisá los datos.", fieldErrors: errores(p.error) };
  const supabase = await adminDb();
  const sesion = await getSesion();
  if (!supabase || !sesion) return { ok: false, error: "Tu sesión no tiene permiso de admin. Volvé a ingresar." };
  const { error } = await supabase
    .from("event_guests")
    .insert({ event_id: eventId, ...p.data, creado_por: sesion.userId });
  if (error) {
    return error.code === "23505"
      ? { ok: false, error: "Ese mail ya está en la lista.", fieldErrors: { email: "Ese mail ya está en la lista." } }
      : { ok: false, error: traducir(error.message, error.details) };
  }
  revalidatePath("/admin/invitados");
  return { ok: true, mensaje: `Agregaste a ${p.data.nombre}.` };
}

export async function cambiarInvitadoAdmin(id: string, activo: boolean): Promise<Respuesta> {
  const supabase = await adminDb();
  if (!supabase || !uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const { error } = await supabase.from("event_guests").update({ activo }).eq("id", id);
  if (error) return { ok: false, error: traducir(error.message, error.details) };
  revalidatePath("/admin/invitados");
  return { ok: true };
}

export async function borrarInvitadoAdmin(id: string): Promise<Respuesta> {
  const supabase = await adminDb();
  if (!supabase || !uuid.safeParse(id).success) return { ok: false, error: GENERICO };
  const { error } = await supabase.from("event_guests").delete().eq("id", id);
  if (error) {
    return error.code === "23503"
      ? { ok: false, error: "Ya compró con esta invitación: dalo de baja en vez de borrarlo." }
      : { ok: false, error: traducir(error.message, error.details) };
  }
  revalidatePath("/admin/invitados");
  return { ok: true };
}
