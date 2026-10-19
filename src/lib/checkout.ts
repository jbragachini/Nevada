import "server-only";
import { tokenSecretConfigured } from "@/lib/pedido-token";

export type Checkout =
  | { habilitado: true; modo: "prueba" }
  | { habilitado: false; motivo: string };

/**
 * ¿Se pueden registrar pedidos desde la página?
 *
 * Mientras no esté Mercado Pago (etapa 5) la compra real queda apagada. Con PEDIDOS_DE_PRUEBA=true
 * se pueden registrar pedidos de prueba SIN pago, para probar el circuito: quedan «esperando el
 * pago» y vencen solos. Ese modo nunca se activa en la producción de Vercel.
 */
export function getCheckout(): Checkout {
  const baseLista =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    tokenSecretConfigured();
  if (!baseLista) {
    return { habilitado: false, motivo: "La compra se habilita cuando se conecte la base de datos." };
  }
  const pruebas = process.env.PEDIDOS_DE_PRUEBA === "true" && process.env.VERCEL_ENV !== "production";
  if (pruebas) return { habilitado: true, modo: "prueba" };
  return { habilitado: false, motivo: "La compra se habilita cuando se conecte Mercado Pago." };
}
