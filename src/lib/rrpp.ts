import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

/** Datos del panel del RRPP. Todo se lee con su sesión: la base solo devuelve lo suyo. */

export type Panel = {
  entradas: number;
  porTipo: { nombre: string; cantidad: number }[];
  vendido: number;
  comisionGenerada: number;
  comisionCobrada: number;
  cobradoEfectivo: number;
  cobradoTransferencia: number;
  rendidoEfectivo: number;
  rendidoTransferencia: number;
  porAprobar: number;
};

export async function getPanel(): Promise<Panel | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("panel_rrpp");
  if (error) throw new Error(`panel_rrpp: ${error.message}`);
  if (!data) return null;
  const d = data as Record<string, number> & { por_tipo: { nombre: string; cantidad: number }[] };
  return {
    entradas: d.entradas,
    porTipo: d.por_tipo,
    vendido: d.vendido,
    comisionGenerada: d.comision_generada,
    comisionCobrada: d.comision_cobrada,
    cobradoEfectivo: d.cobrado_efectivo,
    cobradoTransferencia: d.cobrado_transferencia,
    rendidoEfectivo: d.rendido_efectivo,
    rendidoTransferencia: d.rendido_transferencia,
    porAprobar: d.por_aprobar,
  };
}

export type Venta = {
  id: string;
  numero: string;
  comprador: string;
  origen: "web" | "rrpp";
  metodo: "mercadopago" | "transferencia_web" | "efectivo_rrpp" | "transferencia_rrpp" | "transferencia_nevada";
  status: string;
  total: number;
  creadoEn: string;
  evento: string;
  items: { nombre: string; cantidad: number }[];
  entradas: { id: string; titular: string; status: string }[];
};

type VentaRow = {
  id: string;
  numero: string;
  comprador_nombre: string;
  comprador_apellido: string;
  origen: Venta["origen"];
  metodo_pago: Venta["metodo"];
  status: string;
  total: number;
  creado_en: string;
  events: { nombre: string } | null;
  order_items: { cantidad: number; ticket_types: { nombre: string; orden: number } | null }[];
  tickets: { id: string; titular_nombre: string; status: string }[];
};

export async function getMisVentas(): Promise<Venta[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,numero,comprador_nombre,comprador_apellido,origen,metodo_pago,status,total,creado_en," +
        "events(nombre),order_items(cantidad,ticket_types(nombre,orden)),tickets(id,titular_nombre,status)",
    )
    .order("creado_en", { ascending: false })
    .limit(200);
  if (error) throw new Error(`mis ventas: ${error.message}`);
  return ((data ?? []) as unknown as VentaRow[]).map((o) => ({
    id: o.id,
    numero: o.numero,
    comprador: `${o.comprador_nombre} ${o.comprador_apellido}`.trim(),
    origen: o.origen,
    metodo: o.metodo_pago,
    status: o.status,
    total: o.total,
    creadoEn: o.creado_en,
    evento: o.events?.nombre ?? "",
    items: o.order_items
      .slice()
      .sort((a, b) => (a.ticket_types?.orden ?? 0) - (b.ticket_types?.orden ?? 0))
      .map((i) => ({ nombre: i.ticket_types?.nombre ?? "", cantidad: i.cantidad })),
    entradas: o.tickets
      .slice()
      .sort((a, b) => a.titular_nombre.localeCompare(b.titular_nombre, "es"))
      .map((t) => ({ id: t.id, titular: t.titular_nombre, status: t.status })),
  }));
}

export type EventoCarga = {
  id: string;
  nombre: string;
  fechaInicio: string;
  tipos: { id: string; nombre: string; precio: number; comision: number; maxPorCompra: number }[];
};

/** Eventos con ventas abiertas y sus tipos a la venta (con la comisión del RRPP). */
export async function getEventosParaCargar(): Promise<EventoCarga[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("events")
    .select("id,nombre,fecha_inicio,ticket_types(id,nombre,precio,comision_rrpp,max_por_compra,en_venta,orden)")
    .eq("ventas_abiertas", true)
    .order("fecha_inicio", { ascending: true });
  if (error) throw new Error(`eventos: ${error.message}`);
  type Row = {
    id: string;
    nombre: string;
    fecha_inicio: string;
    ticket_types: {
      id: string;
      nombre: string;
      precio: number;
      comision_rrpp: number;
      max_por_compra: number;
      en_venta: boolean;
      orden: number;
    }[];
  };
  return ((data ?? []) as Row[]).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    fechaInicio: e.fecha_inicio,
    tipos: e.ticket_types
      .filter((t) => t.en_venta)
      .sort((a, b) => a.orden - b.orden)
      .map((t) => ({
        id: t.id,
        nombre: t.nombre,
        precio: t.precio,
        comision: t.comision_rrpp,
        maxPorCompra: t.max_por_compra,
      })),
  }));
}

export type Invitados = {
  evento: { id: string; nombre: string; fechaInicio: string; acceso: "lista" | "clave"; clave: string | null } | null;
  lista: { id: string; nombre: string; email: string; maxEntradas: number; activo: boolean }[];
};

/** El evento con invitación que está en la página: su lista de invitados de este RRPP o su palabra clave. */
export async function getMisInvitados(): Promise<Invitados> {
  const supabase = await getServerSupabase();
  if (!supabase) return { evento: null, lista: [] };
  const { data: ev } = await supabase
    .from("events")
    .select("id,nombre,fecha_inicio,acceso,clave_acceso")
    .eq("publicado", true)
    .in("acceso", ["lista", "clave"])
    .maybeSingle();
  if (!ev) return { evento: null, lista: [] };
  const evento = {
    id: ev.id,
    nombre: ev.nombre,
    fechaInicio: ev.fecha_inicio,
    acceso: ev.acceso as "lista" | "clave",
    clave: ev.clave_acceso,
  };
  if (evento.acceso === "clave") return { evento, lista: [] };
  const { data, error } = await supabase
    .from("event_guests")
    .select("id,nombre,email,max_entradas,activo")
    .eq("event_id", ev.id)
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`invitados: ${error.message}`);
  return {
    evento,
    lista: (data ?? []).map((g) => ({
      id: g.id,
      nombre: g.nombre,
      email: g.email,
      maxEntradas: g.max_entradas,
      activo: g.activo,
    })),
  };
}
