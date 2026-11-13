import "server-only";

export type Contacto = { instagram: string | null; whatsapp: string | null; email: string | null };

/**
 * Contacto y redes de Nevada que ve el comprador. Se cargan en las variables del servidor
 * (CONTACTO_INSTAGRAM, CONTACTO_WHATSAPP, CONTACTO_EMAIL); lo que no esté cargado no se muestra.
 */
export function getContacto(): Contacto {
  const ig = process.env.CONTACTO_INSTAGRAM?.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/+$/, "");
  const wa = process.env.CONTACTO_WHATSAPP?.replace(/\D/g, "");
  const mail = process.env.CONTACTO_EMAIL?.trim();
  return {
    instagram: ig && /^[A-Za-z0-9._]{1,30}$/.test(ig) ? ig : null,
    whatsapp: wa && wa.length >= 8 && wa.length <= 15 ? wa : null,
    email: mail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) ? mail : null,
  };
}

/** ¿Están configurados los mails? Sin la clave de Resend las entradas se ven solo en el link del pedido. */
export function mailConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}
