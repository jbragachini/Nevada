/**
 * Cookies de sesión: solo las lee el servidor (HttpOnly), viajan solo por HTTPS en producción y no
 * se mandan desde otros sitios (SameSite=Lax). El navegador nunca usa Supabase Auth directo.
 */
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
