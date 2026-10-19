"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCheckout } from "@/lib/checkout";
import { hashDeIp, hashDelToken, tokenDelPedido, tokenSecretConfigured } from "@/lib/pedido-token";
import { invitacionSchema, pedidoSchema, type InvitacionResult, type PedidoResult } from "@/lib/pedido-schema";
import { getAdminSupabase } from "@/lib/supabase/admin";

const GENERICO = "No pudimos registrar el pedido. Probá de nuevo en un momento.";

/**
 * Registra una compra web y lleva al comprador a su link privado /pedido/[token].
 * Todo lo que importa lo vuelve a controlar la base (crear_pedido_web): precios, cupo, ventas
 * abiertas, RRPP activo y límites anti abuso.
 */
export async function crearPedido(input: unknown): Promise<PedidoResult> {
  const checkout = getCheckout();
  const supabase = getAdminSupabase();
  if (!checkout.habilitado || !supabase) {
    return { ok: false, error: checkout.habilitado ? GENERICO : checkout.motivo };
  }

  const parsed = pedidoSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const campo = issue.path[0] === "items" ? "cantidad" : String(issue.path[0]);
      fieldErrors[campo] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const p = parsed.data;

  const ip = await ipDelPedido();
  const token = tokenDelPedido(p.idempotencyKey);

  const { error } = await supabase.rpc("crear_pedido_web", {
    p_event_id: p.eventId,
    p_items: p.items.map((i) => ({ ticket_type_id: i.ticketTypeId, cantidad: i.cantidad })),
    p_nombre: p.nombre,
    p_apellido: p.apellido,
    p_email: p.email,
    p_whatsapp: p.whatsapp ?? "",
    p_seller_id: p.rrppId || null,
    p_idempotency_key: p.idempotencyKey,
    p_token_hash: hashDelToken(token),
    p_ip_hash: ip ? hashDeIp(ip) : null,
  });

  if (error) return traducir(error.message, error.details);

  redirect(`/pedido/${token}`);
}

/**
 * Evento con invitación: ¿este mail está en la lista? Devuelve el nombre del invitado y cuántas
 * entradas le quedan. La base limita las consultas por IP para que no se pueda adivinar la lista.
 */
export async function verificarInvitacion(input: unknown): Promise<InvitacionResult> {
  const supabase = getAdminSupabase();
  if (!supabase || !tokenSecretConfigured()) {
    return { ok: false, error: "La compra se habilita cuando se conecte la base de datos." };
  }
  const parsed = invitacionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá el correo electrónico" };

  const ip = await ipDelPedido();
  const { data, error } = await supabase.rpc("verificar_invitacion", {
    p_event_id: parsed.data.eventId,
    p_email: parsed.data.email,
    p_ip_hash: ip ? hashDeIp(ip) : null,
  });
  if (error) {
    if (error.message === "NEV:demasiados_intentos") {
      return { ok: false, error: "Probaste muchos mails seguidos. Esperá unos minutos y volvé a intentar." };
    }
    console.error("verificar_invitacion:", error.message);
    return { ok: false, error: GENERICO };
  }
  if (!data) {
    return {
      ok: false,
      error: "Ese mail no está en la lista de invitados. Probá con el mail con el que te invitaron.",
    };
  }
  const d = data as { nombre: string; restantes: number };
  return { ok: true, nombre: d.nombre, restantes: d.restantes, email: parsed.data.email.trim().toLowerCase() };
}

async function ipDelPedido(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
}

/** Errores de la base (NEV:código) en palabras para el comprador. */
function traducir(message: string, detail: string | null): PedidoResult {
  const codigo = message.startsWith("NEV:") ? message.slice(4) : null;
  switch (codigo) {
    case "ventas_cerradas":
      return { ok: false, error: "La venta se cerró recién. Probá de nuevo más tarde." };
    case "evento_no_disponible":
      return { ok: false, error: "Este evento ya no está a la venta. Recargá la página." };
    case "sin_cupo":
      return {
        ok: false,
        fieldErrors: {
          cantidad: detail
            ? `No quedan suficientes «${detail}». Bajá la cantidad e intentá de nuevo.`
            : "No quedan suficientes entradas. Bajá la cantidad e intentá de nuevo.",
        },
      };
    case "cantidad_maxima":
      return {
        ok: false,
        fieldErrors: {
          cantidad: detail
            ? `Pediste más «${detail}» de las que se pueden comprar juntas.`
            : "Pediste más entradas de las que se pueden comprar juntas.",
        },
      };
    case "tipo_no_disponible":
      return { ok: false, fieldErrors: { cantidad: "Una de las entradas ya no está a la venta. Recargá la página." } };
    case "sin_entradas":
    case "cantidad_invalida":
      return { ok: false, fieldErrors: { cantidad: "Elegí al menos una entrada" } };
    case "rrpp_no_disponible":
      return { ok: false, fieldErrors: { rrpp: "Ese RRPP ya no está disponible. Elegí otro o «Nadie, compro directo»." } };
    case "no_invitado":
      return { ok: false, fieldErrors: { email: "Ese mail no está en la lista de invitados." } };
    case "supera_invitacion":
      return {
        ok: false,
        fieldErrors: {
          cantidad:
            detail === "0"
              ? "Ya usaste todas las entradas de tu invitación."
              : `Tu invitación permite ${detail} entrada${detail === "1" ? "" : "s"} más.`,
        },
      };
    case "demasiados_pedidos":
    case "demasiados_pendientes":
      return {
        ok: false,
        error: "Hiciste varios pedidos seguidos sin pagar. Esperá unos minutos y volvé a intentar.",
      };
    default:
      console.error("crear_pedido_web:", message);
      return { ok: false, error: GENERICO };
  }
}
