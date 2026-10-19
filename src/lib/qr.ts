import "server-only";
import { createHmac } from "node:crypto";
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
