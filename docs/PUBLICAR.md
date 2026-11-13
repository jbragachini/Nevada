# Publicar Nevada en Internet

El sitio es una página web común: se entra con un link desde cualquier celular o computadora (Chrome, Safari, el navegador de Instagram o WhatsApp), sin instalar nada. Para publicarlo hacen falta dos cuentas gratuitas: **Supabase** (la base de datos) y **Vercel** (donde vive la página). El dominio propio, los mails y Mercado Pago son opcionales y se suman después.

Las claves **nunca** se mandan por chat ni se suben al repositorio: se cargan en Vercel → *Settings → Environment Variables*.

## 1. Supabase (base de datos, usuarios y comprobantes)

1. Crear una cuenta en supabase.com y un proyecto nuevo (región São Paulo). Guardar la contraseña de la base.
2. *SQL Editor* → pegar entero `supabase/todo-en-uno.sql` → *Run*. Una sola vez.
3. *Authentication → Sign In / Providers*: dejar **Email** activo, **desactivar «Allow new users to sign up»** y desactivar «Confirm email».
4. *Authentication → Multi-Factor*: TOTP activado (viene así).
5. Crear el usuario admin: *Authentication → Users → Add user* (mail y contraseña larga). Copiar su `UID` y en el SQL Editor:
   `insert into profiles (id, nombre, usuario, rol, activo) values ('UID', 'Joaquín', 'admin', 'admin', true);`
6. *Project Settings → API*: de acá salen `Project URL`, `anon public` y `service_role` para el paso 2.

## 2. Vercel (la página)

1. Crear una cuenta en vercel.com entrando con GitHub y elegir *Add New → Project* → repositorio `jbragachini/Nevada`.
2. Rama a publicar: en *Settings → Git → Production Branch* poner `etapa-1-venta` (o pasar los cambios a `main`).
3. *Settings → Environment Variables* (todas en *Production*):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `service_role` (secreta) |
| `PEDIDO_TOKEN_SECRET` | 64 caracteres al azar (`openssl rand -hex 32`) |
| `QR_SIGNING_SECRET` | otros 64 caracteres al azar, distintos |
| `NEXT_PUBLIC_SITE_URL` | la dirección pública, por ejemplo `https://nevada.vercel.app` |
| `PAGO_ALIAS` | `nevadaoncativo` |
| `PAGO_TITULAR` | nombre del titular de la cuenta (opcional) |
| `CONTACTO_INSTAGRAM`, `CONTACTO_WHATSAPP`, `CONTACTO_EMAIL` | lo que se quiera mostrar al pie (opcional) |

   Los dos secretos al azar no se cambian nunca más: si cambian, dejan de andar los links de pedidos y los QR ya emitidos.
4. *Deploy*. Al terminar, Vercel da la dirección pública (`https://….vercel.app`). Si no coincide con `NEXT_PUBLIC_SITE_URL`, corregir la variable y volver a publicar (*Deployments → Redeploy*).

## 3. Primer uso

1. Entrar a `https://TU-SITIO/ingresar` con el usuario admin. La primera vez pide activar la **doble verificación** con una app autenticadora. Hacerlo enseguida.
2. *Admin → Eventos*: revisar fecha, lugar, precios, cupos y comisiones. **Abrir las ventas** cuando esté todo listo.
3. Hacer una compra de prueba real desde un celular: transferir, subir el comprobante, aprobarla en *Por aprobar*, ver el QR y leerlo en *Puerta*. Después anular esa entrada.
4. Los RRPP piden acceso en `/ingresar` y se aprueban en *Admin → RRPP*.

## 4. Opcionales

**Dominio propio.** Comprarlo (por ejemplo `.com.ar` en NIC Argentina), agregarlo en Vercel → *Settings → Domains*, cargar los DNS que indica Vercel y actualizar `NEXT_PUBLIC_SITE_URL`.

**Mails con las entradas (Resend).** Necesita dominio propio verificado.
1. Cuenta en resend.com → *Domains* → agregar el dominio y cargar sus registros DNS.
2. *API Keys* → crear una clave.
3. En Vercel: `RESEND_API_KEY` y `EMAIL_FROM="Nevada Producciones <entradas@TU-DOMINIO>"`. Volver a publicar.

**Mercado Pago (cobra comisión).**
1. mercadopago.com.ar/developers → *Tus integraciones* → crear aplicación (Checkout Pro).
2. *Webhooks* → URL `https://TU-SITIO/api/mercadopago/webhook`, evento **Pagos**. Copiar la **clave secreta**.
3. En Vercel: `MP_ACCESS_TOKEN` (Access Token de producción) y `MP_WEBHOOK_SECRET`. Volver a publicar.
4. Probar primero con las credenciales de prueba de Mercado Pago: esta integración se verificó contra un Mercado Pago simulado, no contra una cuenta real.

## Qué revisar si algo no anda

- La página dice «Vista previa»: faltan las variables de Supabase en Vercel.
- «La compra se habilita cuando se conecte la base»: falta `SUPABASE_SERVICE_ROLE_KEY` o `PEDIDO_TOKEN_SECRET` (mínimo 32 caracteres).
- Los QR no se ven: falta `QR_SIGNING_SECRET`.
- No aparece Mercado Pago: faltan sus dos claves o `NEXT_PUBLIC_SITE_URL` no empieza con `https://`.
- Los mails no llegan: *Admin → Auditoría* no los muestra; mirar en Supabase la tabla `email_log` (columna `error`) y el dominio en Resend.
