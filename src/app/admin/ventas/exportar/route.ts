import { getEventoActual, getEventos, getVentas, type FiltroVentas } from "@/lib/admin";
import { formatFechaHora } from "@/lib/format";
import { requireAdmin } from "@/lib/sesion";

export const dynamic = "force-dynamic";

const COMO: Record<string, string> = {
  mercadopago: "Web · Mercado Pago",
  transferencia_web: "Web · transferencia a Nevada",
  efectivo_rrpp: "RRPP · efectivo",
  transferencia_rrpp: "RRPP · transferencia al RRPP",
  transferencia_nevada: "RRPP · transferencia a Nevada",
};

const ESTADO: Record<string, string> = {
  pendiente_pago: "Esperando el pago",
  pagado: "Por aprobar",
  por_confirmar: "Por aprobar",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
  vencido: "Vencido",
};

/**
 * Una celda de CSV. Lo que escribe el comprador (nombre, mail) puede empezar con = + - @: Excel lo
 * tomaría como fórmula, así que se le antepone un apóstrofo.
 */
function celda(v: string | number | null): string {
  let s = v === null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Ventas con los mismos filtros de la pantalla, para abrir en Excel. Solo el admin (con doble verificación). */
export async function GET(request: Request) {
  await requireAdmin();
  const sp = new URL(request.url).searchParams;
  const filtro: FiltroVentas = {
    vendedor: sp.get("vendedor") ?? "todos",
    estado: sp.get("estado") ?? "todos",
    alcance: sp.get("alcance") === "todos" ? "todos" : "evento",
    q: sp.get("q") ?? "",
  };
  const eventos = await getEventos();
  const actual = await getEventoActual(eventos);
  const ventas = await getVentas(filtro, actual?.id ?? null, 5000);

  const filas = [
    ["Pedido", "Fecha", "Evento", "Comprador", "Mail", "WhatsApp", "Entradas", "Detalle", "Cómo se pagó", "Vendedor", "Estado", "Total", "Comisión RRPP", "Motivo de rechazo"],
    ...ventas.map((v) => [
      v.numero,
      formatFechaHora(v.creadoEn),
      v.evento,
      v.comprador,
      v.email,
      v.whatsapp,
      v.items.reduce((a, i) => a + i.cantidad, 0),
      v.items.map((i) => `${i.cantidad} ${i.nombre}`).join(", "),
      COMO[v.metodo] ?? v.metodo,
      v.vendedor ?? "Directo",
      ESTADO[v.status] ?? v.status,
      v.total,
      v.comision,
      v.motivoRechazo,
    ]),
  ];
  // BOM + punto y coma: así Excel en español lo abre con acentos y en columnas.
  const csv = "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
  const hoy = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-nevada-${hoy}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
