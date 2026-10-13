# Nevada

Plataforma de venta y control de entradas de **Nevada Producciones** — Navidad con Nevada 2026.

Dirección: **https://www.nevadaproducciones.com**

La propuesta completa (arquitectura, modelo de datos, pantallas y etapas) está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Estado

| Etapa | Estado |
|---|---|
| 1. Página pública de venta | ✅ Terminada (diseño, selección de entradas, datos del comprador, medio de pago, total, ventas cerradas / agotadas) |
| 2. Pedidos y base de datos | 🟡 Migraciones listas para evento, tipos de entrada y RRPP; falta registrar pedidos |
| 3–8 | ⏳ Pendientes |

**Medio de pago:** Mercado Pago (Checkout Pro). El comprador paga el total en Mercado Pago; el pedido queda *pagado* solo cuando Mercado Pago lo confirma al servidor, y las entradas con QR se liberan cuando el administrador aprueba el pedido. Mercado Pago cobra comisión por cada venta según el plazo de acreditación elegido.

El botón **Pagar con Mercado Pago** está deshabilitado a propósito hasta que se conecten los pedidos (etapa 2) y Mercado Pago (etapa 5). No se simula ningún pago.

Sin Supabase configurado, la página muestra una **vista previa** con datos de ejemplo y un aviso visible.

## Correr en tu computadora

```bash
npm install
cp .env.example .env.local   # completar con tus claves
npm run dev                  # http://localhost:3000
```

## Configurar Supabase (falta hacerlo)

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pegar y ejecutar en orden los archivos de `supabase/migrations/` (`0001_…`, `0002_…`).
   Crea el evento *Navidad con Nevada 2026* con las ventas **cerradas** y dos tipos de entrada (General $15.000 y +25 $20.000, cupos 400 y 200: son valores iniciales, editables).
3. En **Project Settings → API**, copiar `Project URL` y `anon public key` a `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Cargar los RRPP (mientras no exista el panel admin):
   `insert into sellers (nombre_publico, codigo) values ('Nombre Apellido', 'nombre');`
   Su link personal será `https://www.nevadaproducciones.com/?rrpp=nombre`.
5. Para abrir las ventas mientras no exista el panel admin:
   `update event_settings set ventas_abiertas = true where activo;`

## Dominio: www.nevadaproducciones.com (falta comprarlo y conectarlo)

1. Comprar `nevadaproducciones.com` en un registrador de dominios .com.
2. En Vercel → proyecto → **Settings → Domains**, agregar `www.nevadaproducciones.com` y `nevadaproducciones.com` (redirige a www).
3. En el registrador, cargar los registros DNS que indica Vercel.
4. En Resend → **Domains**, agregar `nevadaproducciones.com` y cargar sus registros DNS (SPF, DKIM) para que los mails salgan desde `entradas@nevadaproducciones.com` y no caigan en spam.
5. En Vercel → **Environment Variables**: `NEXT_PUBLIC_SITE_URL=https://www.nevadaproducciones.com`.

## Tecnología

Next.js 15 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL + Auth + Storage) · Mercado Pago Checkout Pro · Resend.
