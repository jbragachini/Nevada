import "server-only";
import { cookies } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Lecturas del panel del admin. Todo se lee con la sesión del admin: RLS le deja ver todo y las
 * funciones admin_* verifican que lo sea.
 */

async function db() {
  const supabase = await getServerSupabase();
  if (!supabase) throw new Error("Supabase no está configurado");
  return supabase;
}

export type EventoFila = {
  id: string;
  nombre: string;
  subtitulo: string | null;
  fechaInicio: string;
  lugar: string;
  direccion: string | null;
  ciudad: string;
  descripcion: string | null;
  publicado: boolean;
  ventasAbiertas: boolean;
  acceso: "publico" | "lista" | "clave";
  claveAcceso: string | null;
  mostrarRrpp: boolean;
  portada: "a" | "c";
};

type EventoRow = {
  id: string;
  nombre: string;
  subtitulo: string | null;
  fecha_inicio: string;
  lugar: string;
  direccion: string | null;
  ciudad: string;
  descripcion: string | null;
  publicado: boolean;
  ventas_abiertas: boolean;
  acceso: EventoFila["acceso"];
  clave_acceso: string | null;
  mostrar_rrpp: boolean;
  portada: "a" | "c";
};

const EVENTO_COLS =
  "id,nombre,subtitulo,fecha_inicio,lugar,direccion,ciudad,descripcion,publicado,ventas_abiertas,acceso,clave_acceso,mostrar_rrpp,portada";

function evento(r: EventoRow): EventoFila {
  return {
    id: r.id,
    nombre: r.nombre,
    subtitulo: r.subtitulo,
    fechaInicio: r.fecha_inicio,
    lugar: r.lugar,
    direccion: r.direccion,
    ciudad: r.ciudad,
    descripcion: r.descripcion,
    publicado: r.publicado,
    ventasAbiertas: r.ventas_abiertas,
    acceso: r.acceso,
    claveAcceso: r.clave_acceso,
    mostrarRrpp: r.mostrar_rrpp,
    portada: r.portada,
  };
}

export async function getEventos(): Promise<EventoFila[]> {
  const { data, error } = await (await db())
    .from("events")
    .select(EVENTO_COLS)
    .order("fecha_inicio", { ascending: false });
  if (error) throw new Error(`eventos: ${error.message}`);
  return ((data ?? []) as EventoRow[]).map(evento);
}

export const COOKIE_EVENTO = "nevada_admin_evento";

/** Evento sobre el que trabaja el panel: el elegido arriba, o el que está en la página, o el más nuevo. */
export async function getEventoActual(eventos: EventoFila[]): Promise<EventoFila | null> {
  const elegido = (await cookies()).get(COOKIE_EVENTO)?.value;
  return (
    eventos.find((e) => e.id === elegido) ?? eventos.find((e) => e.publicado) ?? eventos[0] ?? null
  );
}

export type Tipo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  cupoTotal: number;
  comision: number;
  maxPorCompra: number;
  enVenta: boolean;
  orden: number;
};

export async function getTipos(eventId: string): Promise<Tipo[]> {
  const { data, error } = await (await db())
    .from("ticket_types")
    .select("id,nombre,descripcion,precio,cupo_total,comision_rrpp,max_por_compra,en_venta,orden")
    .eq("event_id", eventId)
    .order("orden");
  if (error) throw new Error(`tipos: ${error.message}`);
  return (data ?? []).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    descripcion: t.descripcion,
    precio: t.precio,
    cupoTotal: t.cupo_total,
    comision: t.comision_rrpp,
    maxPorCompra: t.max_por_compra,
    enVenta: t.en_venta,
    orden: t.orden,
  }));
}

export type Resumen = {
  tipos: { id: string; nombre: string; precio: number; cupo: number; enVenta: boolean; vendidas: number; ocupadas: number }[];
  recaudado: number;
  porAprobar: number;
  esperandoPago: number;
  ingresos: number;
  ranking: { nombre: string; entradas: number; vendido: number }[];
};

export async function getResumen(eventId: string): Promise<Resumen> {
  const { data, error } = await (await db()).rpc("admin_resumen_evento", { p_event_id: eventId });
  if (error) throw new Error(`resumen: ${error.message}`);
  const d = data as {
    tipos: { id: string; nombre: string; precio: number; cupo: number; en_venta: boolean; vendidas: number; ocupadas: number }[];
    recaudado: number;
    por_aprobar: number;
    esperando_pago: number;
    ingresos: number;
    ranking: { nombre: string; entradas: number; vendido: number }[];
  };
  return {
    tipos: d.tipos.map((t) => ({ ...t, enVenta: t.en_venta })),
    recaudado: d.recaudado,
    porAprobar: d.por_aprobar,
    esperandoPago: d.esperando_pago,
    ingresos: d.ingresos,
    ranking: d.ranking,
  };
}

export type Pedido = {
  id: string;
  numero: string;
  comprador: string;
  email: string;
  whatsapp: string | null;
  evento: string;
  origen: "web" | "rrpp";
  metodo: "mercadopago" | "efectivo_rrpp" | "transferencia_rrpp" | "transferencia_nevada";
  status: string;
  total: number;
  comision: number;
  vendedor: string | null;
  sellerId: string | null;
  creadoEn: string;
  items: { nombre: string; cantidad: number }[];
  mpPaymentId: string | null;
  motivoRechazo: string | null;
};

type PedidoRow = {
  id: string;
  numero: string;
  comprador_nombre: string;
  comprador_apellido: string;
  comprador_email: string;
  comprador_whatsapp: string | null;
  origen: Pedido["origen"];
  metodo_pago: Pedido["metodo"];
  status: string;
  total: number;
  creado_en: string;
  seller_id: string | null;
  motivo_rechazo: string | null;
  events: { nombre: string } | null;
  sellers: { nombre_publico: string } | null;
  order_items: { cantidad: number; comision_unitaria: number; ticket_types: { nombre: string; orden: number } | null }[];
  payments: { mp_payment_id: string | null }[];
};

const PEDIDO_COLS =
  "id,numero,comprador_nombre,comprador_apellido,comprador_email,comprador_whatsapp,origen,metodo_pago,status,total," +
  "creado_en,seller_id,motivo_rechazo,events(nombre),sellers(nombre_publico)," +
  "order_items(cantidad,comision_unitaria,ticket_types(nombre,orden)),payments(mp_payment_id)";

function pedido(o: PedidoRow): Pedido {
  return {
    id: o.id,
    numero: o.numero,
    comprador: `${o.comprador_nombre} ${o.comprador_apellido}`.trim(),
    email: o.comprador_email,
    whatsapp: o.comprador_whatsapp,
    evento: o.events?.nombre ?? "",
    origen: o.origen,
    metodo: o.metodo_pago,
    status: o.status,
    total: o.total,
    comision: o.seller_id ? o.order_items.reduce((a, i) => a + i.cantidad * i.comision_unitaria, 0) : 0,
    vendedor: o.sellers?.nombre_publico ?? null,
    sellerId: o.seller_id,
    creadoEn: o.creado_en,
    items: o.order_items
      .slice()
      .sort((a, b) => (a.ticket_types?.orden ?? 0) - (b.ticket_types?.orden ?? 0))
      .map((i) => ({ nombre: i.ticket_types?.nombre ?? "", cantidad: i.cantidad })),
    mpPaymentId: o.payments.find((p) => p.mp_payment_id)?.mp_payment_id ?? null,
    motivoRechazo: o.motivo_rechazo,
  };
}

/** Pedidos que esperan la aprobación del admin (todos los eventos). */
export async function getPorAprobar(): Promise<Pedido[]> {
  const { data, error } = await (await db())
    .from("orders")
    .select(PEDIDO_COLS)
    .in("status", ["pagado", "por_confirmar"])
    .order("creado_en", { ascending: true });
  if (error) throw new Error(`por aprobar: ${error.message}`);
  return ((data ?? []) as unknown as PedidoRow[]).map(pedido);
}

export type FiltroVentas = {
  vendedor: string; // "todos" | "directo" | seller id
  estado: string; // "todos" | "por_aprobar" | "aprobado" | "rechazado" | "esperando_pago"
  alcance: "evento" | "todos";
  q: string;
};

export async function getVentas(f: FiltroVentas, eventId: string | null): Promise<Pedido[]> {
  let query = (await db()).from("orders").select(PEDIDO_COLS).order("creado_en", { ascending: false }).limit(500);
  if (f.alcance === "evento" && eventId) query = query.eq("event_id", eventId);
  if (f.vendedor === "directo") query = query.is("seller_id", null);
  else if (f.vendedor !== "todos") query = query.eq("seller_id", f.vendedor);
  if (f.estado === "por_aprobar") query = query.in("status", ["pagado", "por_confirmar"]);
  else if (f.estado === "esperando_pago") query = query.eq("status", "pendiente_pago");
  else if (f.estado !== "todos") query = query.eq("status", f.estado);
  const q = f.q.trim().replace(/[,()*%]/g, " ").trim();
  if (q) {
    query = query.or(
      `numero.ilike.%${q}%,comprador_nombre.ilike.%${q}%,comprador_apellido.ilike.%${q}%,comprador_email.ilike.%${q}%`,
    );
  }
  const { data, error } = await query;
  if (error) throw new Error(`ventas: ${error.message}`);
  return ((data ?? []) as unknown as PedidoRow[]).map(pedido);
}

export type Saldo = {
  sellerId: string;
  nombre: string;
  codigo: string;
  activo: boolean;
  usuario: string | null;
  entradas: number;
  vendido: number;
  comisionGenerada: number;
  comisionPagada: number;
  cobradoEfectivo: number;
  cobradoTransferencia: number;
  rendidoEfectivo: number;
  rendidoTransferencia: number;
};

export async function getSaldos(): Promise<Saldo[]> {
  const { data, error } = await (await db()).rpc("admin_saldos_rrpp");
  if (error) throw new Error(`saldos: ${error.message}`);
  return (data as Record<string, never>[]).map((r) => ({
    sellerId: r.seller_id,
    nombre: r.nombre,
    codigo: r.codigo,
    activo: r.activo,
    usuario: r.usuario,
    entradas: r.entradas,
    vendido: r.vendido,
    comisionGenerada: r.comision_generada,
    comisionPagada: r.comision_pagada,
    cobradoEfectivo: r.cobrado_efectivo,
    cobradoTransferencia: r.cobrado_transferencia,
    rendidoEfectivo: r.rendido_efectivo,
    rendidoTransferencia: r.rendido_transferencia,
  }));
}

export type Movimiento = { id: string; fecha: string; tipo: "comision" | "rendicion"; rrpp: string; detalle: string; monto: number };

export async function getMovimientos(): Promise<Movimiento[]> {
  const s = await db();
  const [{ data: pagos }, { data: rend }] = await Promise.all([
    s.from("commission_payouts").select("id,creado_en,monto,medio,nota,sellers(nombre_publico)").order("creado_en", { ascending: false }).limit(100),
    s.from("seller_settlements").select("id,creado_en,monto_efectivo,monto_transferencia,nota,sellers(nombre_publico)").order("creado_en", { ascending: false }).limit(100),
  ]);
  type P = { id: string; creado_en: string; monto: number; medio: string; nota: string | null; sellers: { nombre_publico: string } | null };
  type R = { id: string; creado_en: string; monto_efectivo: number; monto_transferencia: number; nota: string | null; sellers: { nombre_publico: string } | null };
  const out: Movimiento[] = [
    ...((pagos ?? []) as unknown as P[]).map((p) => ({
      id: p.id,
      fecha: p.creado_en,
      tipo: "comision" as const,
      rrpp: p.sellers?.nombre_publico ?? "",
      detalle: `Pago de comisión · ${p.medio}${p.nota ? ` · ${p.nota}` : ""}`,
      monto: p.monto,
    })),
    ...((rend ?? []) as unknown as R[]).map((r) => ({
      id: r.id,
      fecha: r.creado_en,
      tipo: "rendicion" as const,
      rrpp: r.sellers?.nombre_publico ?? "",
      detalle: `Rindió · efectivo $${r.monto_efectivo.toLocaleString("es-AR")} · transferencias $${r.monto_transferencia.toLocaleString("es-AR")}${r.nota ? ` · ${r.nota}` : ""}`,
      monto: r.monto_efectivo + r.monto_transferencia,
    })),
  ];
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export type Acceso = { id: string; nombre: string; usuario: string; email: string | null; whatsapp: string | null; creadoEn: string };

export async function getAccesosPendientes(): Promise<Acceso[]> {
  const { data, error } = await (await db())
    .from("access_requests")
    .select("id,whatsapp,creado_en,profiles!access_requests_profile_id_fkey(nombre,usuario)")
    .eq("estado", "pendiente")
    .order("creado_en");
  if (error) throw new Error(`accesos: ${error.message}`);
  type Row = { id: string; whatsapp: string | null; creado_en: string; profiles: { nombre: string; usuario: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    nombre: r.profiles?.nombre ?? "",
    usuario: r.profiles?.usuario ?? "",
    email: null,
    whatsapp: r.whatsapp,
    creadoEn: r.creado_en,
  }));
}

export type Rrpp = {
  id: string;
  nombre: string;
  codigo: string;
  usuario: string | null;
  activo: boolean;
  puedeCargarVentas: boolean;
  maxInvitados: number | null;
};

export async function getRrpps(): Promise<Rrpp[]> {
  const { data, error } = await (await db())
    .from("sellers")
    .select("id,nombre_publico,codigo,activo,puede_cargar_ventas,max_invitados,profiles(usuario)")
    .order("nombre_publico");
  if (error) throw new Error(`rrpp: ${error.message}`);
  type Row = {
    id: string;
    nombre_publico: string;
    codigo: string;
    activo: boolean;
    puede_cargar_ventas: boolean;
    max_invitados: number | null;
    profiles: { usuario: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    nombre: r.nombre_publico,
    codigo: r.codigo,
    usuario: r.profiles?.usuario ?? null,
    activo: r.activo,
    puedeCargarVentas: r.puede_cargar_ventas,
    maxInvitados: r.max_invitados,
  }));
}

export type InvitadoAdmin = {
  id: string;
  nombre: string;
  email: string;
  maxEntradas: number;
  activo: boolean;
  invitadoPor: string;
};

export async function getInvitadosEvento(eventId: string): Promise<InvitadoAdmin[]> {
  const { data, error } = await (await db())
    .from("event_guests")
    .select("id,nombre,email,max_entradas,activo,sellers(nombre_publico)")
    .eq("event_id", eventId)
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`invitados: ${error.message}`);
  type Row = { id: string; nombre: string; email: string; max_entradas: number; activo: boolean; sellers: { nombre_publico: string } | null };
  return ((data ?? []) as unknown as Row[]).map((g) => ({
    id: g.id,
    nombre: g.nombre,
    email: g.email,
    maxEntradas: g.max_entradas,
    activo: g.activo,
    invitadoPor: g.sellers?.nombre_publico ?? "Nevada",
  }));
}

export type Entrada = {
  id: string;
  titular: string;
  email: string;
  tipo: string;
  status: "valida" | "usada" | "anulada";
  numero: string;
  emitidoEn: string;
  usadaEn: string | null;
};

export async function getEntradas(eventId: string, q: string): Promise<Entrada[]> {
  const { data, error } = await (await db())
    .from("tickets")
    .select("id,titular_nombre,titular_email,status,emitido_en,usada_en,ticket_types!inner(nombre,event_id),orders(numero)")
    .eq("ticket_types.event_id", eventId)
    .order("emitido_en", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`entradas: ${error.message}`);
  type Row = {
    id: string;
    titular_nombre: string;
    titular_email: string;
    status: Entrada["status"];
    emitido_en: string;
    usada_en: string | null;
    ticket_types: { nombre: string } | null;
    orders: { numero: string } | null;
  };
  const busca = q.trim().toLowerCase();
  return ((data ?? []) as unknown as Row[])
    .map((t) => ({
      id: t.id,
      titular: t.titular_nombre,
      email: t.titular_email,
      tipo: t.ticket_types?.nombre ?? "",
      status: t.status,
      numero: t.orders?.numero ?? "",
      emitidoEn: t.emitido_en,
      usadaEn: t.usada_en,
    }))
    .filter((t) => !busca || `${t.titular} ${t.email} ${t.numero}`.toLowerCase().includes(busca));
}

export type Auditoria = { id: number; fecha: string; actor: string; accion: string; entidad: string; detalle: string };

export async function getAuditoria(): Promise<Auditoria[]> {
  const { data, error } = await (await db())
    .from("audit_log")
    .select("id,creado_en,accion,entidad,entidad_id,despues,profiles(nombre)")
    .order("id", { ascending: false })
    .limit(300);
  if (error) throw new Error(`auditoría: ${error.message}`);
  type Row = { id: number; creado_en: string; accion: string; entidad: string; entidad_id: string | null; despues: Record<string, unknown> | null; profiles: { nombre: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    fecha: r.creado_en,
    actor: r.profiles?.nombre ?? "Sistema",
    accion: r.accion,
    entidad: r.entidad,
    detalle: resumenCambio(r.despues),
  }));
}

function resumenCambio(d: Record<string, unknown> | null): string {
  if (!d) return "";
  const claves = ["numero", "nombre", "status", "monto", "efectivo", "transferencia", "codigo", "usuario", "motivo", "precio", "comision_rrpp", "publicado", "ventas_abiertas", "acceso"];
  return claves
    .filter((k) => d[k] !== undefined && d[k] !== null)
    .map((k) => `${k.replace("_", " ")}: ${String(d[k])}`)
    .join(" · ");
}
