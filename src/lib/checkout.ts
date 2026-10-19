import "server-only";
import { tokenSecretConfigured } from "@/lib/pedido-token";

export type Checkout =
  | { habilitado: true; modo: "transferencia" }
  | { habilitado: false; motivo: string };

/**
 * ¿Se pueden registrar pedidos desde la página?
 *
 * La compra web se paga con una transferencia común a la cuenta de Nevada (sin comisión): el
 * comprador transfiere, sube el comprobante y el admin aprueba. Alcanza con la base conectada.
 */
export function getCheckout(): Checkout {
  const baseLista =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    tokenSecretConfigured();
  if (!baseLista) {
    return { habilitado: false, motivo: "La compra se habilita cuando se conecte la base de datos." };
  }
  return { habilitado: true, modo: "transferencia" };
}

/** A dónde se transfiere. Se configura en Vercel; el alias por defecto es el de Nevada. */
export function getCuentaPago(): { alias: string; titular: string | null } {
  return {
    alias: (process.env.PAGO_ALIAS || "nevadaoncativo").trim(),
    titular: process.env.PAGO_TITULAR?.trim() || null,
  };
}
