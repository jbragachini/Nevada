import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";

/**
 * Contenido del QR de una entrada: NEV1.<qr_token>.<firma>.
 * qr_token es aleatorio (lo genera la base al emitir) y la firma es un HMAC con QR_SIGNING_SECRET:
 * sin el secreto del servidor nadie puede fabricar un QR válido. La Puerta (etapa 7) verifica la
 * firma antes de consultar la base.
 */
function secret(): string | null {
  const s = process.env.QR_SIGNING_SECRET;
  return s && s.length >= 32 ? s : null;
}

export function qrConfigurado(): boolean {
  return secret() !== null;
}

export function contenidoQr(qrToken: string): string {
  const s = secret();
  if (!s) throw new Error("QR_SIGNING_SECRET no está configurado");
  const firma = createHmac("sha256", s).update(`NEV1.${qrToken}`).digest("base64url");
  return `NEV1.${qrToken}.${firma}`;
}

export async function qrSvg(contenido: string): Promise<string> {
  return QRCode.toString(contenido, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#061a36", light: "#ffffff" },
  });
}

/**
 * Lo que leyó la Puerta: un QR firmado (NEV1.token.firma) o el código corto tipeado a mano.
 * Devuelve qué buscar en la base, o null si no es una entrada de Nevada (firma falsa o formato desconocido).
 */
export function leerQr(leido: string): string | null {
  const texto = leido.trim();
  const m = /^NEV1\.([0-9a-f]{64})\.([A-Za-z0-9_-]{43})$/.exec(texto);
  if (m) {
    const s = secret();
    if (!s) return null;
    const esperada = Buffer.from(createHmac("sha256", s).update(`NEV1.${m[1]}`).digest("base64url"));
    const recibida = Buffer.from(m[2]);
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? m[1] : null;
  }
  const codigo = texto.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-F]{8}$/.test(codigo) ? codigo : null;
}

/** Código corto de una entrada, para mostrar debajo del QR: «A1B2-C3D4». */
export function codigoCorto(qrToken: string): string {
  const c = qrToken.slice(0, 8).toUpperCase();
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
