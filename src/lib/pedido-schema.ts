import { z } from "zod";

/** Datos del comprador: lo valida el formulario y lo vuelve a validar el servidor. */
export const buyerSchema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre").max(60, "Usá hasta 60 letras"),
  apellido: z.string().trim().min(2, "Ingresá tu apellido").max(60, "Usá hasta 60 letras"),
  email: z.string().trim().max(254).email("Revisá el correo electrónico"),
  whatsapp: z
    .string()
    .trim()
    .regex(/^[0-9+\s()-]{8,20}$/, "Revisá el número de WhatsApp")
    .optional()
    .or(z.literal("")),
});

/**
 * Pedido que manda el navegador. Solo tipos y cantidades: precios y total los calcula la base.
 * idempotencyKey la genera el navegador una vez por compra para que un doble click o un reintento
 * no creen dos pedidos.
 */
export const pedidoSchema = buyerSchema.extend({
  eventId: z.string().uuid(),
  items: z
    .array(z.object({ ticketTypeId: z.string().uuid(), cantidad: z.number().int().min(1).max(50) }))
    .min(1, "Elegí al menos una entrada")
    .max(20),
  rrppId: z.string().uuid().optional().or(z.literal("")),
  idempotencyKey: z.string().uuid(),
});

export type PedidoInput = z.infer<typeof pedidoSchema>;

export type PedidoResult = {
  ok: false;
  /** Mensaje general, para mostrar junto al botón de pago. */
  error?: string;
  /** Errores por campo (nombre, apellido, email, whatsapp, cantidad, rrpp). */
  fieldErrors?: Record<string, string>;
};
