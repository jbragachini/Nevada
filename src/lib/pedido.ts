import "server-only";
import { hashDelToken, TOKEN_RE } from "@/lib/pedido-token";
import { getAdminSupabase } from "@/lib/supabase/admin";

export type EstadoPedido =
  | "pendiente_pago"
  | "pagado"
  | "por_confirmar"
  | "aprobado"
  | "rechazado"
  | "cancelado"
  | "vencido";

export type Pedido = {
  numero: string;
  status: EstadoPedido;
  total: number;
  compradorNombre: string;
  compradorEmail: string;
  creadoEn: string;
  venceEn: string | null;
  evento: { nombre: string; subtitulo: string | null; fechaInicio: string; lugar: string; ciudad: string };
  items: { nombre: string; cantidad: number; precioUnitario: number; subtotal: number }[];
  entradasEmitidas: number;
  entradas: { titular: string; tipo: string; qrToken: string; status: "valida" | "usada" | "anulada" }[];
};

type Row = {
  numero: string;
  status: EstadoPedido;
  total: number;
  comprador_nombre: string;
  comprador_email: string;
  creado_en: string;
  vence_en: string | null;
  evento: { nombre: string; subtitulo: string | null; fecha_inicio: string; lugar: string; ciudad: string };
  items: { nombre: string; cantidad: number; precio_unitario: number; subtotal: number }[];
  entradas_emitidas: number;
  entradas: { titular: string; tipo: string; qr_token: string; status: "valida" | "usada" | "anulada" }[];
};

/** Pedido del link privado. null si el token no es válido o no existe. */
export async function getPedido(token: string): Promise<Pedido | null> {
  if (!TOKEN_RE.test(token)) return null;
  const supabase = getAdminSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("pedido_por_token", { p_token_hash: hashDelToken(token) });
  if (error) throw new Error(`pedido_por_token: ${error.message}`);
  if (!data) return null;

  const r = data as Row;
  return {
    numero: r.numero,
    status: r.status,
    total: r.total,
    compradorNombre: r.comprador_nombre,
    compradorEmail: r.comprador_email,
    creadoEn: r.creado_en,
    venceEn: r.vence_en,
    evento: {
      nombre: r.evento.nombre,
      subtitulo: r.evento.subtitulo,
      fechaInicio: r.evento.fecha_inicio,
      lugar: r.evento.lugar,
      ciudad: r.evento.ciudad,
    },
    items: r.items.map((i) => ({
      nombre: i.nombre,
      cantidad: i.cantidad,
      precioUnitario: i.precio_unitario,
      subtotal: i.subtotal,
    })),
    entradasEmitidas: r.entradas_emitidas,
    entradas: (r.entradas ?? []).map((e) => ({ titular: e.titular, tipo: e.tipo, qrToken: e.qr_token, status: e.status })),
  };
}
