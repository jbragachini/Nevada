import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mercado Pago (Checkout Pro), medio de pago OPCIONAL: aparece solo si Nevada cargó sus credenciales
 * (MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET). Mercado Pago cobra comisión por venta; la transferencia no.
 *
 * El pago nunca se da por bueno por lo que diga el navegador: Mercado Pago avisa al servidor con una
 * firma (webhook), el servidor consulta el pago en la API de Mercado Pago y recién ahí lo registra.
 */

const API = () => (process.env.MP_API_URL || "https://api.mercadopago.com").replace(/\/+$/, "");
const token = () => process.env.MP_ACCESS_TOKEN?.trim() || null;
const secreto = () => process.env.MP_WEBHOOK_SECRET?.trim() || null;

function sitio(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
}

/**
 * Necesita las dos claves y una dirección pública https (Mercado Pago no avisa a localhost).
 * MP_API_URL solo se usa en las pruebas automáticas, contra un Mercado Pago de mentira.
 */
export function mpConfigurado(): boolean {
  return !!token() && !!secreto() && (/^https:\/\//.test(sitio()) || !!process.env.MP_API_URL);
}

/** Crea la preferencia de pago de un pedido y devuelve a dónde mandar al comprador. */
export async function crearPreferencia(pedido: {
  numero: string;
  total: number;
  evento: string;
  email: string;
  venceEn: string | null;
  linkPedido: string;
}): Promise<string | null> {
  const t = token();
  if (!t || !mpConfigurado()) return null;
  const res = await fetch(`${API()}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      // Un doble click no crea dos preferencias para el mismo pedido.
      "X-Idempotency-Key": `nevada-${pedido.numero}`,
    },
    body: JSON.stringify({
      items: [
        {
          id: pedido.numero,
          title: `Entradas ${pedido.evento} · pedido ${pedido.numero}`,
          quantity: 1,
          currency_id: "ARS",
          unit_price: pedido.total,
        },
      ],
      payer: { email: pedido.email },
      external_reference: pedido.numero,
      back_urls: { success: pedido.linkPedido, pending: pedido.linkPedido, failure: pedido.linkPedido },
      auto_return: "approved",
      notification_url: `${sitio()}/api/mercadopago/webhook`,
      // Aprobado o rechazado en el momento: sin pagos «pendientes» (efectivo en un local, etc.).
      binary_mode: true,
      statement_descriptor: "NEVADA PROD",
      ...(pedido.venceEn ? { expires: true, expiration_date_to: pedido.venceEn } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const cuerpo = (await res.json().catch(() => null)) as { init_point?: string; message?: string } | null;
  if (!res.ok || !cuerpo?.init_point) {
    console.error("mercadopago: preferencia:", res.status, cuerpo?.message ?? "");
    return null;
  }
  return cuerpo.init_point;
}

/**
 * Verifica la firma del aviso de Mercado Pago (cabecera x-signature: «ts=…,v1=…»).
 * v1 = HMAC-SHA256(secreto, «id:<data.id>;request-id:<x-request-id>;ts:<ts>;»).
 */
export function firmaValida(input: { firma: string | null; requestId: string | null; dataId: string | null }): boolean {
  const s = secreto();
  if (!s || !input.firma || !input.dataId) return false;
  const partes = Object.fromEntries(
    input.firma.split(",").map((x) => x.split("=").map((y) => y.trim()) as [string, string]),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return false;
  // Avisos viejos reenviados por un tercero no sirven: se aceptan hasta 15 minutos de diferencia.
  const edad = Math.abs(Date.now() - Number(ts) * (ts.length <= 10 ? 1000 : 1));
  if (!Number.isFinite(edad) || edad > 15 * 60 * 1000) return false;
  const manifiesto = `id:${input.dataId.toLowerCase()};${input.requestId ? `request-id:${input.requestId};` : ""}ts:${ts};`;
  const esperada = Buffer.from(createHmac("sha256", s).update(manifiesto).digest("hex"));
  const recibida = Buffer.from(v1);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

export type PagoMp = { id: string; estado: string; monto: number; moneda: string; referencia: string | null };

/** Consulta un pago en Mercado Pago con la credencial de Nevada: es la única fuente que se cree. */
export async function consultarPago(id: string): Promise<PagoMp | null> {
  const t = token();
  if (!t || !/^[0-9]{1,30}$/.test(id)) return null;
  const res = await fetch(`${API()}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.error("mercadopago: pago:", id, res.status);
    return null;
  }
  const p = (await res.json()) as {
    id: number | string;
    status: string;
    transaction_amount: number;
    currency_id: string;
    external_reference: string | null;
  };
  return {
    id: String(p.id),
    estado: p.status,
    monto: Math.floor(p.transaction_amount),
    moneda: p.currency_id,
    referencia: p.external_reference,
  };
}
