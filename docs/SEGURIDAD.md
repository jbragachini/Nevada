# Nevada Producciones 2026 — Seguridad

Plan de seguridad de la plataforma. Se aplica desde la primera línea de código, no al final; la etapa 8 es la revisión y las pruebas de todo lo que está acá.

## 1. Quién puede hacer qué

| Rol | Cómo obtiene acceso | Ve | Puede hacer | No puede |
|---|---|---|---|---|
| Comprador | Sin cuenta | Evento, precios, su propio pedido (link privado) | Comprar, descargar sus entradas | Ver datos de otros, entrar a paneles |
| RRPP | Pide acceso con usuario y contraseña; el admin lo aprueba | Solo sus ventas, sus comisiones y lo que debe rendir | Cargar ventas (si el admin lo habilitó), ver los QR de sus ventas | Ver otros RRPP, aprobar pagos, cambiar comisiones, usar la Puerta |
| Admin | Cuenta creada al instalar; contraseña + doble verificación (2FA) | Todo | Aprobar/rechazar, emitir/anular entradas, comisiones, rendiciones, evento, RRPP, **escáner de puerta** | — |

La Puerta (escáner de QR) es exclusiva del admin. Si más adelante se necesita personal de puerta, se agrega como rol aparte que solo puede escanear.

## 2. Cómo se hace cumplir (tres barreras)

1. **Interfaz:** cada usuario ve solo los menús de su rol. Es comodidad, no seguridad.
2. **Servidor:** toda acción (aprobar, cargar venta, registrar pago, escanear) pasa por una función de servidor que vuelve a verificar la sesión y el rol antes de hacer nada.
3. **Base de datos (RLS de Postgres):** aunque alguien saltee la interfaz y llame a la base directo, las políticas solo le devuelven sus propias filas. Un RRPP pidiendo ventas de otro recibe cero resultados.

## 3. Cuentas y contraseñas

- Supabase Auth: contraseñas guardadas con hash (bcrypt). Nunca en texto plano, nunca visibles ni para el admin.
- Mínimo 8 caracteres; se rechazan contraseñas filtradas conocidas.
- **2FA obligatorio para el admin** (app autenticadora).
- Registro de RRPP: queda **pendiente** hasta que el admin lo aprueba. Nadie se auto-asigna un rol.
- Bloqueo temporal tras varios intentos fallidos; límite de intentos por IP.
- Recuperación de contraseña por mail con link de un solo uso que vence.
- Sesiones con cookies `HttpOnly`, `Secure`, `SameSite`; cierre de sesión en todos los dispositivos desde el admin (por si un RRPP pierde el celular).
- El admin puede desactivar un RRPP al instante: pierde acceso y su link deja de funcionar.

## 4. Pagos y dinero

- El pedido pasa a *pagado* solo cuando Mercado Pago lo confirma al servidor con una notificación **firmada**; se verifica la firma y se consulta el pago a la API de Mercado Pago. Volver a la página no alcanza.
- El monto se calcula siempre en el servidor con los precios de la base, nunca con lo que manda el navegador.
- Comisiones, pagos a RRPP y rendiciones: solo el admin las escribe; cada movimiento queda en el registro de auditoría con quién, cuándo y cuánto.
- No se guardan datos de tarjetas: los maneja Mercado Pago.

## 5. Entradas y QR

- Cada QR lleva un código aleatorio de 128 bits firmado (HMAC con clave secreta del servidor). No se puede adivinar ni fabricar uno válido.
- La validación en puerta es atómica en la base: si dos celulares escanean la misma entrada a la vez, solo uno la acepta y el otro ve *YA UTILIZADA*.
- Las entradas en efectivo que genera un RRPP quedan identificadas con su nombre; el admin puede anularlas.
- Reenviar el mail no genera QR nuevos.

## 6. Datos personales

- Se pide solo lo necesario: nombre, mail y WhatsApp opcional.
- Comprobantes y datos de compradores en almacenamiento privado; acceso solo por links firmados que vencen.
- Cumplimiento de la Ley 25.326 de Protección de Datos Personales (Argentina): aviso de privacidad en la página y forma de pedir la baja de datos.

## 7. Infraestructura

- HTTPS en todo el sitio (Vercel) y cabeceras de seguridad: CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`.
- Claves secretas solo en variables de entorno del servidor (nunca en el navegador ni en el repositorio).
- Validación de todo lo que entra (Zod) y consultas parametrizadas: sin inyección SQL ni XSS.
- Límite de pedidos por minuto en compra, ingreso y escaneo (anti abuso y anti bots).
- Copias de seguridad diarias de la base (Supabase) y prueba de restauración antes del evento.
- Dependencias actualizadas y revisadas (`npm audit`, Dependabot).

## 8. Registro de auditoría

Se registra: ingresos al sistema, aprobaciones y rechazos, emisión y anulación de entradas, cambios de precios y comisiones, pagos a RRPP, rendiciones, altas y bajas de usuarios. Nadie puede borrar ese registro, ni el admin.

## 9. Pruebas antes de abrir la venta (etapa 8)

- Pruebas automáticas de permisos: un RRPP intentando ver o modificar lo de otro, un comprador intentando entrar al admin, un QR falso o repetido.
- Revisión de cada política RLS.
- Prueba de carga simulando la apertura de ventas.
- Checklist OWASP Top 10.
