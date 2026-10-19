import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Link privado del pedido (/pedido/[token]).
 *
 * El token se deriva con HMAC de la clave de idempotencia que genera el navegador al armar la
 * compra: un reintento del mismo pedido da el mismo link, y sin el secreto del servidor nadie
 * puede calcular el token de otro pedido. A la base solo llega el SHA-256 del token.
 */

function secret(): string | null {
  const s = process.env.PEDIDO_TOKEN_SECRET;
  return s && s.length >= 32 ? s : null;
}

export function tokenSecretConfigured(): boolean {
  return secret() !== null;
}

export function tokenDelPedido(idempotencyKey: string): string {
  const s = secret();
  if (!s) throw new Error("PEDIDO_TOKEN_SECRET no está configurado");
  return createHmac("sha256", s).update(`pedido:${idempotencyKey}`).digest("base64url");
}

export function hashDelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** IP irreconocible para el límite de pedidos: se guarda el HMAC, nunca la IP. */
export function hashDeIp(ip: string): string {
  const s = secret();
  if (!s) throw new Error("PEDIDO_TOKEN_SECRET no está configurado");
  return createHmac("sha256", s).update(`ip:${ip}`).digest("hex");
}

/** HMAC-SHA256 en base64url: 43 caracteres. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
