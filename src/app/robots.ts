import type { MetadataRoute } from "next";

/** Solo la página de venta es pública: paneles, pedidos y la API no se indexan. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/rrpp", "/ingresar", "/pedido", "/api"] }],
  };
}
