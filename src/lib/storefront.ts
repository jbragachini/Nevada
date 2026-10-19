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
  /** "lista": solo compra quien está en la lista de invitados. "clave": quien sabe la palabra clave. */
  acceso: "publico" | "lista" | "clave";
  /** Mostrar «¿Quién te vendió?». Oculto, el link ?rrpp= igual asigna la venta. */
  mostrarRrpp: boolean;
  /** Portada de la página de venta: "a" camino hacia la montaña, "c" contraluz azul. */
  portada: Portada;
};

export type Portada = "a" | "c";

export type StorefrontTicket = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  disponibles: number;
  maxPorCompra: number;
  enVenta: boolean;
};

export type StorefrontRrpp = { id: string; nombre: string; codigo: string };

export type Storefront =
  | { mode: "live"; event: StorefrontEvent; tickets: StorefrontTicket[]; rrpps: StorefrontRrpp[] }
  | { mode: "preview"; event: StorefrontEvent; tickets: StorefrontTicket[]; rrpps: StorefrontRrpp[] }
  | { mode: "no-event" }
  | { mode: "error"; message: string };

/**
 * Datos de ejemplo SOLO para ver el diseño cuando Supabase no está configurado.
 * En este modo la compra queda deshabilitada y la página lo avisa.
 */
const PREVIEW: { event: StorefrontEvent; tickets: StorefrontTicket[]; rrpps: StorefrontRrpp[] } = {
  event: {
    id: "preview",
    nombre: "Navidad con Nevada 2026",
    subtitulo: "DJ Nacho Heisecke",
    fechaInicio: "2026-12-25T02:59:00.000Z",
    lugar: "Lugar a confirmar",
    direccion: null,
    ciudad: "Oncativo, Córdoba",
    ventasAbiertas: true,
    acceso: "publico",
    mostrarRrpp: true,
    portada: "a",
  },
  tickets: [
    {
      id: "preview-general",
      nombre: "Entrada General",
      descripcion: "Acceso general al evento",
      precio: 15000,
      disponibles: 400,
      maxPorCompra: 10,
      enVenta: true,
    },
    {
      id: "preview-mas25",
      nombre: "Entrada +25",
      descripcion: "Acceso para mayores de 25",
      precio: 20000,
      disponibles: 200,
      maxPorCompra: 10,
      enVenta: true,
    },
  ],
  rrpps: [
    { id: "preview-1", nombre: "RRPP de ejemplo 1", codigo: "ejemplo-1" },
    { id: "preview-2", nombre: "RRPP de ejemplo 2", codigo: "ejemplo-2" },
  ],
};

export async function getStorefront(): Promise<Storefront> {
  const supabase = getPublicSupabase();
  if (!supabase) return { mode: "preview", ...PREVIEW };

  const { data: ev, error: evErr } = await supabase
    .from("storefront_event")
    .select("id,nombre,subtitulo,fecha_inicio,lugar,direccion,ciudad,ventas_abiertas,acceso,mostrar_rrpp,portada")
    .maybeSingle();

  if (evErr) return { mode: "error", message: evErr.message };
  if (!ev) return { mode: "no-event" };

  const { data: tt, error: ttErr } = await supabase
    .from("storefront_ticket_types")
    .select("id,nombre,descripcion,precio,disponibles,max_por_compra,en_venta,orden")
    .eq("event_id", ev.id)
    .order("orden", { ascending: true });

  if (ttErr) return { mode: "error", message: ttErr.message };

  const { data: rr, error: rrErr } = await supabase
    .from("storefront_sellers")
    .select("id,nombre_publico,codigo")
    .order("nombre_publico", { ascending: true });

  if (rrErr) return { mode: "error", message: rrErr.message };

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
      acceso: ev.acceso === "lista" || ev.acceso === "clave" ? ev.acceso : "publico",
      mostrarRrpp: ev.mostrar_rrpp,
      portada: ev.portada === "c" ? "c" : "a",
    },
    tickets: (tt ?? []).map((t) => ({
      id: t.id,
      nombre: t.nombre,
      descripcion: t.descripcion,
      precio: t.precio,
      disponibles: t.disponibles,
      maxPorCompra: t.max_por_compra,
      enVenta: t.en_venta,
    })),
    rrpps: (rr ?? []).map((r) => ({ id: r.id, nombre: r.nombre_publico, codigo: r.codigo })),
  };
}
