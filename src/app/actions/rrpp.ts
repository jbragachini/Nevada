"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashDelToken, tokenDelPedido, tokenSecretConfigured } from "@/lib/pedido-token";
import { codigoCorto, contenidoQr, qrConfigurado, qrSvg } from "@/lib/qr";
import { getSesion } from "@/lib/sesion";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Acciones del RRPP. Corren con la sesión del RRPP: la base decide qué puede hacer (RLS y funciones
 * que toman al RRPP de auth.uid(), nunca de lo que manda el navegador).
 */

const GENERICO = "No pudimos guardar. Probá de nuevo en un momento.";

export type Fallo = { ok: false; error?: string; fieldErrors?: Record<string, string> };
export type Resultado<T = object> = ({ ok: true } & T) | Fallo;

const ventaSchema = z.object({
  eventId: z.string().uuid(),
  personas: z
    .array(
      z.object({
        ticketTypeId: z.string().uuid(),
        nombre: z
          .string()
          .trim()
          .max(120)
          .regex(/^\S{2,}(\s+\S+)*\s+\S{2,}$/, "Nombre y apellido"),
        email: z.string().trim().max(254).email("Revisá el mail").optional().or(z.literal("")),
      }),
    )
    .min(1, "Elegí al menos una entrada")
    .max(20, "Hasta 20 entradas por venta"),
  metodo: z.enum(["efectivo_rrpp", "transferencia_rrpp", "transferencia_nevada"]),
  whatsapp: z
    .string()
    .trim()
    .regex(/^[0-9+\s()-]{8,20}$/, "Revisá el número de WhatsApp")
    .optional()
    .or(z.literal("")),
  idempotencyKey: z.string().uuid(),
});

export async function cargarVenta(
  input: unknown,
): Promise<Resultado<{ numero: string; status: string; total: number }>> {
  const supabase = await getServerSupabase();
  if (!supabase || !tokenSecretConfigured()) return { ok: false, error: "Falta configurar la base de datos." };

  const parsed = ventaSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      // personas.0.nombre → persona-0-nombre
      const campo = issue.path[0] === "personas" && issue.path.length > 2
        ? `persona-${String(issue.path[1])}-${String(issue.path[2])}`
        : issue.path[0] === "personas" ? "cantidad" : String(issue.path[0]);
      fieldErrors[campo] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;
  if (!v.personas[0].email) return { ok: false, fieldErrors: { "persona-0-email": "El mail de la persona 1 es obligatorio" } };

  const token = tokenDelPedido(v.idempotencyKey);
  const { data, error } = await supabase.rpc("cargar_venta_rrpp", {
    p_event_id: v.eventId,
    p_personas: v.personas.map((p) => ({ ticket_type_id: p.ticketTypeId, nombre: p.nombre, email: p.email ?? "" })),
    p_metodo: v.metodo,
    p_whatsapp: v.whatsapp ?? "",
    p_idempotency_key: v.idempotencyKey,
    p_token_hash: hashDelToken(token),
  });
  if (error) return traducirVenta(error.message, error.details);

  const fila = (data as { numero: string; status: string; total: number }[])[0];
  revalidatePath("/rrpp");
  return { ok: true, numero: fila.numero, status: fila.status, total: fila.total };
}

function traducirVenta(message: string, detail: string | null): Fallo {
  switch (message.startsWith("NEV:") ? message.slice(4) : null) {
    case "sin_permiso":
      return { ok: false, error: "Tu usuario todavía no está habilitado para vender." };
    case "no_carga_ventas":
      return { ok: false, error: "Nevada no te habilitó para cargar ventas. Hablá con el admin." };
    case "ventas_cerradas":
    case "evento_no_disponible":
      return { ok: false, error: "Las ventas de este evento están cerradas." };
    case "tipo_no_disponible":
      return { ok: false, fieldErrors: { cantidad: "Una de las entradas ya no está a la venta. Recargá la página." } };
    case "sin_cupo":
      return { ok: false, fieldErrors: { cantidad: `No quedan suficientes «${detail ?? "entradas"}».` } };
    case "cantidad_maxima":
      return { ok: false, fieldErrors: { cantidad: "Son demasiadas entradas para una sola venta." } };
    case "persona_sin_nombre":
      return {
        ok: false,
        fieldErrors: { [`persona-${Number(detail ?? "1") - 1}-nombre`]: "Nombre y apellido" },
      };
    case "persona_sin_email":
      return { ok: false, fieldErrors: { "persona-0-email": "El mail de la persona 1 es obligatorio" } };
    default:
      console.error("cargar_venta_rrpp:", message);
      return { ok: false, error: GENERICO };
  }
}

/** QR de una entrada que cargó este RRPP (la base solo le devuelve las suyas). */
export async function qrDeEntrada(
  ticketId: string,
): Promise<Resultado<{ svg: string; titular: string; codigo: string }>> {
  if (!z.string().uuid().safeParse(ticketId).success) return { ok: false, error: "Entrada inválida." };
  if (!qrConfigurado()) return { ok: false, error: "Falta configurar la firma de los QR (QR_SIGNING_SECRET)." };
  const supabase = await getServerSupabase();
  if (!supabase) return { ok: false, error: GENERICO };
  const { data } = await supabase
    .from("tickets")
    .select("qr_token,titular_nombre,status")
    .eq("id", ticketId)
    .maybeSingle();
  if (!data) return { ok: false, error: "No encontramos esa entrada." };
  return {
    ok: true,
    svg: await qrSvg(contenidoQr(data.qr_token)),
    titular: data.titular_nombre,
    codigo: codigoCorto(data.qr_token),
  };
}

const invitadoSchema = z.object({
  eventId: z.string().uuid(),
  nombre: z.string().trim().min(2, "Ingresá el nombre").max(120),
  email: z.string().trim().toLowerCase().max(254).email("Revisá el mail"),
  maxEntradas: z.coerce.number().int().min(1, "Al menos 1").max(20, "Hasta 20"),
});

export async function agregarInvitado(input: unknown): Promise<Resultado> {
  const supabase = await getServerSupabase();
  const sesion = await getSesion();
  if (!supabase || !sesion?.seller) return { ok: false, error: "Tu usuario todavía no está habilitado." };

  const parsed = invitadoSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  const g = parsed.data;
  const { error } = await supabase.from("event_guests").insert({
    event_id: g.eventId,
    nombre: g.nombre,
    email: g.email,
    max_entradas: g.maxEntradas,
    seller_id: sesion.seller.id,
    creado_por: sesion.userId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, fieldErrors: { email: "Ese mail ya está en la lista de invitados." } };
    if (error.message === "NEV:tope_invitados") {
      return { ok: false, error: `Llegaste a tu tope de ${error.details} invitados para este evento.` };
    }
    console.error("agregarInvitado:", error.message);
    return { ok: false, error: GENERICO };
  }
  revalidatePath("/rrpp/invitados");
  return { ok: true };
}

export async function cambiarInvitado(input: unknown): Promise<Resultado> {
  const parsed = z.object({ id: z.string().uuid(), activo: z.boolean() }).safeParse(input);
  const supabase = await getServerSupabase();
  if (!parsed.success || !supabase) return { ok: false, error: GENERICO };
  const { error, count } = await supabase
    .from("event_guests")
    .update({ activo: parsed.data.activo }, { count: "exact" })
    .eq("id", parsed.data.id);
  if (error) {
    if (error.message === "NEV:tope_invitados") {
      return { ok: false, error: `Llegaste a tu tope de ${error.details} invitados para este evento.` };
    }
    return { ok: false, error: GENERICO };
  }
  if (!count) return { ok: false, error: "No encontramos ese invitado." };
  revalidatePath("/rrpp/invitados");
  return { ok: true };
}

export async function borrarInvitado(id: string): Promise<Resultado> {
  const supabase = await getServerSupabase();
  if (!z.string().uuid().safeParse(id).success || !supabase) return { ok: false, error: GENERICO };
  const { error } = await supabase.from("event_guests").delete().eq("id", id);
  if (error) {
    // Ya compró: no se borra, se da de baja.
    if (error.code === "23503") return { ok: false, error: "Ya compró con esta invitación: dalo de baja en vez de borrarlo." };
    return { ok: false, error: GENERICO };
  }
  revalidatePath("/rrpp/invitados");
  return { ok: true };
}
