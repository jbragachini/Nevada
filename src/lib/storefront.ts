import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";

export type StorefrontEvent = {
  id: string;
  nombre: string;
  subtitulo: string | null;
  fechaInicio: string; // ISO
  lugar: string;
  direccion: string | null;
  ciudad: string;
  ventasAbiertas: boolean;
};

export type StorefrontTicket = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponibles: number;
  maxPorCompra: number;
  enVenta: boolean;
};

export type Storefront =
  | { mode: "live"; event: StorefrontEvent; tickets: StorefrontTicket[] }
  | { mode: "preview"; event: StorefrontEvent; tickets: StorefrontTicket[] }
  | { mode: "no-event" }
  | { mode: "error"; message: string };

/**
 * Datos de ejemplo SOLO para ver el diseño cuando Supabase no está configurado.
 * En este modo la compra queda deshabilitada y la página lo avisa.
 */
const PREVIEW: { event: StorefrontEvent; tickets: StorefrontTicket[] } = {
  event: {
    id: "preview",
    nombre: "Navidad con Nevada 2026",
    subtitulo: "DJ Nacho Heisecke",
    fechaInicio: "2026-12-25T02:59:00.000Z",
    lugar: "Lugar a confirmar",
    direccion: null,
    ciudad: "Oncativo, Córdoba",
    ventasAbiertas: true,
  },
  tickets: [
    {
      id: "preview-general",
      codigo: "general",
      nombre: "Entrada General",
      descripcion: "Acceso general al evento",
      precio: 15000,
      disponibles: 400,
      maxPorCompra: 10,
      enVenta: true,
    },
    {
      id: "preview-mas25",
      codigo: "mas25",
      nombre: "Entrada +25",
      descripcion: "Acceso para mayores de 25",
      precio: 20000,
      disponibles: 200,
      maxPorCompra: 10,
      enVenta: true,
    },
  ],
};

export async function getStorefront(): Promise<Storefront> {
  const supabase = getPublicSupabase();
  if (!supabase) return { mode: "preview", ...PREVIEW };

  const { data: ev, error: evErr } = await supabase
    .from("event_settings")
    .select("id,nombre,subtitulo,fecha_inicio,lugar,direccion,ciudad,ventas_abiertas")
    .eq("activo", true)
    .maybeSingle();

  if (evErr) return { mode: "error", message: evErr.message };
  if (!ev) return { mode: "no-event" };

  const { data: tt, error: ttErr } = await supabase
    .from("storefront_ticket_types")
    .select("id,codigo,nombre,descripcion,precio,disponibles,max_por_compra,en_venta,orden")
    .eq("event_id", ev.id)
    .order("orden", { ascending: true });

  if (ttErr) return { mode: "error", message: ttErr.message };

  return {
    mode: "live",
    event: {
      id: ev.id,
      nombre: ev.nombre,
      subtitulo: ev.subtitulo,
      fechaInicio: ev.fecha_inicio,
      lugar: ev.lugar,
      direccion: ev.direccion,
      ciudad: ev.ciudad,
      ventasAbiertas: ev.ventas_abiertas,
    },
    tickets: (tt ?? []).map((t) => ({
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      descripcion: t.descripcion,
      precio: t.precio,
      disponibles: t.disponibles,
      maxPorCompra: t.max_por_compra,
      enVenta: t.en_venta,
    })),
  };
}
