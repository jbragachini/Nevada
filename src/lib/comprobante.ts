import "server-only";

/** Comprobantes de transferencia: Storage privado de Supabase, solo los ve el admin. */
export const BUCKET_COMPROBANTES = "comprobantes";
export const MAX_COMPROBANTE = 5 * 1024 * 1024;

const FIRMAS: { tipo: string; ext: string; es: (b: Uint8Array) => boolean }[] = [
  { tipo: "image/jpeg", ext: "jpg", es: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: "image/png", ext: "png", es: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { tipo: "image/webp", ext: "webp", es: (b) => txt(b, 0, 4) === "RIFF" && txt(b, 8, 12) === "WEBP" },
  { tipo: "image/heic", ext: "heic", es: (b) => txt(b, 4, 8) === "ftyp" && /^(heic|heix|mif1|msf1|hevc)$/.test(txt(b, 8, 12)) },
  { tipo: "application/pdf", ext: "pdf", es: (b) => txt(b, 0, 5) === "%PDF-" },
];

function txt(b: Uint8Array, desde: number, hasta: number): string {
  return String.fromCharCode(...b.subarray(desde, hasta));
}

/**
 * Qué archivo es mirando sus primeros bytes (no lo que dice el navegador): solo fotos o PDF.
 * null si no es un comprobante aceptable.
 */
export function tipoDeComprobante(bytes: Uint8Array): { tipo: string; ext: string } | null {
  const f = FIRMAS.find((x) => x.es(bytes));
  return f ? { tipo: f.tipo, ext: f.ext } : null;
}
