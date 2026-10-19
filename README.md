# Nevada

Plataforma de venta y control de entradas de **Nevada Producciones** — Navidad con Nevada 2026.

Dirección: **https://www.nevadaproducciones.com**

Traspaso para Claude Code en [`CLAUDE.md`](CLAUDE.md); demo de referencia en `docs/demo/nevada-demo.html`. La propuesta completa (arquitectura, modelo de datos, pantallas y etapas) está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) y el plan de seguridad en [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md).

## Estado

| Etapa | Estado |
|---|---|
| 1. Página pública de venta | ✅ Terminada (diseño, selección de entradas, datos del comprador, medio de pago, total, ventas cerradas / agotadas) |
| 2. Pedidos y base de datos | ✅ Terminada (modelo de datos completo, seguridad por filas, creación real de pedidos con montos y cupo calculados en la base, link privado de seguimiento `/pedido/[token]`) |
| 3. Panel de vendedores | ✅ Terminada (`/ingresar` con usuario o mail, pedido de acceso de RRPP pendiente de aprobación, panel con métricas, comisiones, lo que hay que rendir, link personal, ventas con QR, carga de ventas con una persona por entrada, lista de invitados) |
| Eventos con invitación | ✅ Cada evento es **público**, **con lista de invitados** (por mail, hasta su máximo de entradas) o **con palabra clave**; se puede ocultar «¿Quién te vendió?» |
| 4. Admin y comisiones | ✅ Terminada (panel `/admin` con doble verificación: resumen, eventos y tipos de entrada, acceso público / lista / palabra clave, por aprobar, ventas por vendedor, comisiones y rendiciones, RRPP y accesos, invitados, entradas y QR, auditoría) |
| 7. Puerta | ✅ Terminada (`/admin/puerta`: cámara del celular, resultado grande en color, código corto a mano, contador; validación atómica en la base) |
| 5, 6 y 8 | ⏳ Pendientes (Mercado Pago, mails con las entradas, revisión final y publicación) |

**Medio de pago:** Mercado Pago (Checkout Pro). El comprador paga el total en Mercado Pago; el pedido queda *pagado* solo cuando Mercado Pago lo confirma al servidor, y las entradas con QR se liberan cuando el administrador aprueba el pedido. Mercado Pago cobra comisión por cada venta según el plazo de acreditación elegido.

El botón **Pagar con Mercado Pago** está deshabilitado a propósito hasta que se conecte Mercado Pago (etapa 5). No se simula ningún pago. Para probar el circuito antes, con `PEDIDOS_DE_PRUEBA=true` el botón pasa a **Registrar pedido de prueba**: crea el pedido de verdad en la base (sin cobrar), lleva al link privado y el pedido vence solo a los 30 minutos. Ese modo nunca se activa en la producción de Vercel.

Sin Supabase configurado, la página muestra una **vista previa** con datos de ejemplo y un aviso visible.

## Correr en tu computadora

```bash
npm install
cp .env.example .env.local   # completar con tus claves
npm run dev                  # http://localhost:3000
```

Para probar la base de datos sin Supabase (necesita PostgreSQL 15+ instalado):

```bash
scripts/probar-base.sh       # aplica todas las migraciones en una base descartable y corre las pruebas
```

## Configurar Supabase (falta hacerlo)

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegar y ejecutar en orden todos los archivos de `supabase/migrations/` (`0001_…` a `0009_…`).
   Crea el evento *Navidad con Nevada 2026* en la página, con las ventas **cerradas** y dos tipos de entrada (General $15.000 y +25 $20.000, cupos 400 y 200, comisión $0: son valores iniciales, se cambian desde el panel).
3. En **Project Settings → API**, copiar a `.env.local`: `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`, `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (esta última es secreta: solo servidor).
4. Generar `PEDIDO_TOKEN_SECRET` y `QR_SIGNING_SECRET`, cada uno con `openssl rand -hex 32`.
5. En **Authentication → Sign In / Providers**: dejar habilitado **Email**, **desactivar «Allow new users to sign up»** (los RRPP piden acceso desde `/ingresar`, que crea el usuario desde el servidor; nadie se registra por su cuenta) y desactivar «Confirm email».
6. En **Authentication → Multi-Factor**: dejar habilitado **TOTP** (app autenticadora), que viene activado por defecto.
7. Crear tu usuario de admin: **Authentication → Users → Add user** (mail y contraseña), copiar su `UID` y en el SQL Editor:
   `insert into profiles (id, nombre, usuario, rol, activo) values ('UID', 'Joaquín', 'admin', 'admin', true);`

### Primer ingreso del admin

Entrá en `/ingresar` con tu usuario y contraseña. La primera vez te pide activar la **doble verificación**: escaneás un QR con una app autenticadora (Google Authenticator, Microsoft Authenticator o similar) y desde ahí cada ingreso pide el código de 6 números. Sin ese código la base no deja hacer nada de admin, aunque alguien tenga la contraseña.

Todo lo demás (eventos, precios, comisiones, abrir ventas, aprobar RRPP y pedidos, invitados, palabra clave) se hace desde el panel `/admin`. Los RRPP piden acceso en `/ingresar` y los aprobás en **Admin → RRPP**, donde elegís el código de su link (`/?rrpp=codigo`).

## Dominio: www.nevadaproducciones.com (falta comprarlo y conectarlo)

1. Comprar `nevadaproducciones.com` en un registrador de dominios .com.
2. En Vercel → proyecto → **Settings → Domains**, agregar `www.nevadaproducciones.com` y `nevadaproducciones.com` (redirige a www).
3. En el registrador, cargar los registros DNS que indica Vercel.
4. En Resend → **Domains**, agregar `nevadaproducciones.com` y cargar sus registros DNS (SPF, DKIM) para que los mails salgan desde `entradas@nevadaproducciones.com` y no caigan en spam.
5. En Vercel → **Environment Variables**: `NEXT_PUBLIC_SITE_URL=https://www.nevadaproducciones.com`.

## Tecnología

Next.js 15 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL + Auth + Storage) · Mercado Pago Checkout Pro · Resend.
