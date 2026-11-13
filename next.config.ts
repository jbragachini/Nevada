import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/** Origen de Supabase (API y comprobantes firmados), para permitirlo en la política de contenido. */
function origenSupabase(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

// Política de contenido: todo sale del propio sitio; solo se suma Supabase. Nadie puede poner el
// sitio adentro de un marco (clickjacking) ni mandar formularios a otro dominio.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${origenSupabase()}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${origenSupabase()}`.trim(),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // La cámara solo la usa la Puerta, desde el propio sitio.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      // Paneles, pedidos y API: nunca en cachés compartidas.
      {
        source: "/:seccion(admin|rrpp|ingresar|pedido|api)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
