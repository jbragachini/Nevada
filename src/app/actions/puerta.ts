"use server";

import { z } from "zod";
import { leerQr, qrConfigurado } from "@/lib/qr";
import { getSesion } from "@/lib/sesion";
import { getServerSupabase } from "@/lib/supabase/server";

export type Lectura =
  | {
      ok: true;
      resultado: "valida" | "usada" | "anulada" | "invalida";
      otroEvento: boolean;
      titular: string | null;
      tipo: string | null;
      numero: string | null;
      usadaEn: string | null;
      ingresos: number;
    }
  | { ok: false; error: string };

/**
 * Valida una entrada en la puerta. La firma del QR se verifica acá; un QR falso o desconocido no
 * busca nada, pero el intento queda registrado igual. La base marca la entrada como usada de forma
 * atómica: si dos celulares la leen a la vez, entra una sola.
 */
export async function escanear(eventId: string, leido: string, dispositivo: string): Promise<Lectura> {
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: "Elegí el evento." };
  if (!qrConfigurado()) return { ok: false, error: "Falta configurar la firma de los QR (QR_SIGNING_SECRET)." };
  const sesion = await getSesion();
  const supabase = await getServerSupabase();
  if (!sesion || sesion.rol !== "admin" || !supabase) {
    return { ok: false, error: "Tu sesión venció. Volvé a ingresar." };
  }

  const texto = String(leido ?? "").slice(0, 300);
  const buscar = leerQr(texto) ?? `no-valido:${texto}`;
  const { data, error } = await supabase.rpc("puerta_escanear", {
    p_event_id: eventId,
    p_token: buscar,
    p_dispositivo: String(dispositivo ?? "").slice(0, 120),
  });
  if (error) {
    if (error.message === "NEV:sin_permiso") return { ok: false, error: "Tu sesión venció. Volvé a ingresar." };
    console.error("puerta_escanear:", error.message);
    return { ok: false, error: "No pudimos validar. Probá de nuevo." };
  }
  const d = data as {
    resultado: "valida" | "usada" | "anulada" | "invalida";
    otro_evento: boolean;
    titular: string | null;
    tipo: string | null;
    numero: string | null;
    usada_en: string | null;
    ingresos: number;
  };
  return {
    ok: true,
    resultado: d.resultado,
    otroEvento: d.otro_evento,
    titular: d.titular,
    tipo: d.tipo,
    numero: d.numero,
    usadaEn: d.usada_en,
    ingresos: d.ingresos,
  };
}
