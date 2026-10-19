# Nevada Producciones — Plataforma de venta y control de entradas

Este archivo es el traspaso del proyecto para Claude Code. Leelo completo antes de tocar código. Después leé `docs/ARQUITECTURA.md` (modelo de datos, pantallas y etapas) y `docs/SEGURIDAD.md` (plan de seguridad).

- **Dueño:** Joaquín (Nevada Producciones, Oncativo, Córdoba, Argentina). Escribe en español rioplatense: respondele igual, claro y sin jerga técnica.
- **Primer evento:** «Navidad con Nevada 2026», jueves 24 de diciembre de 2026, 23:59 h, Oncativo. DJ Nacho Heisecke. Lugar a confirmar.
- **Dominio:** www.nevadaproducciones.com (todavía no está comprado).
- **Repo:** github.com/jbragachini/Nevada. Rama de trabajo `etapa-1-venta`; `main` solo tiene el README inicial. No pushear a `main` sin que lo pida.

## Regla de oro

**No simular pagos, envíos de mails ni validaciones.** Lo que dependa de una cuenta que todavía no existe (Supabase, Mercado Pago, Resend) queda deshabilitado y marcado como «falta configurar». Separar siempre lo terminado de lo que requiere configuración. Nunca contraseñas en texto plano ni claves privadas en el navegador.

**Cada tabla o vista nueva:** activar RLS y quitarle permisos a `anon` (Supabase les da todos por defecto; una vista simple acepta escrituras). Cada función nueva con `security definer`: `set search_path = ''` y `revoke execute … from public, anon, authenticated`. Agregar la prueba en `supabase/tests/` y correr `scripts/probar-base.sh`.

## La referencia visual y funcional: la demo

`docs/demo/nevada-demo.html` es una demo interactiva en un solo archivo (JS puro, datos en localStorage) que Joaquín ya probó y aprobó. **Es la especificación de cómo tiene que verse y comportarse la plataforma real.** Abrila en el navegador.

- Usuarios de prueba: `admin / nevada2026` (todo + Puerta), `lucas / lucas123`, `martina / martina123`, `tomas / tomas123` (RRPP).
- Lo que en la demo es simulado (el paso por Mercado Pago, el mail, la cámara por foto) en la plataforma real se hace de verdad.
- Para entrar como RRPP o admin: botón «Ir al ingreso…» abajo. En la web real es `/ingresar`, sin link visible.

## Marca

- **Paleta:**
  - noche `#061a36`
  - profundo `#0c3466`
  - azul `#1b5590`
  - hielo `#a9dcff`
  - blanco
- **Logo elegido:** montaña de tres picos arriba y las letras NE/VA/DA apiladas, todo en azul, con «PRODUCCIONES» debajo.
  - Componente: `src/components/NevadaLogo.tsx`.
  - Path de las letras: `src/components/nevada-letters-path.ts` y `public/brand/nevada-letras.svg`.
- **Tipografías:** Archivo (ancho variable, para los títulos) y Montserrat.
- **Fondo:** azul noche con nieve sutil (`Snowfall.tsx`) y tarjeta blanca central tipo ticket.

## Reglas de negocio (versión final acordada)

### Página de venta (comprador, sin cuenta)
- Muestra **un solo evento**: el que el admin puso «en la página». Poner otro reemplaza al anterior.
- El comprador ve:
  - los tipos de entrada con su precio y un selector de cantidad;
  - sus datos: nombre, apellido, mail y WhatsApp opcional;
  - **«¿Quién te vendió? (opcional)»**, una lista de RRPP con la opción «Nadie, compro directo»;
  - el total y el botón **«Pagar con Mercado Pago»** (Checkout Pro).
- No hay sección «Cómo se paga», ni cuenta regresiva, ni «Mis pedidos».
- Cada RRPP tiene un link `/?rrpp=codigo` que lo deja preseleccionado.
- **Flujo de pago:**
  1. El comprador paga en Mercado Pago.
  2. El webhook firmado marca el pedido como *pagado*.
  3. El admin revisa y **aprueba**.
  4. Recién ahí se emiten los QR y se mandan por mail.
- **Seguimiento:** pantalla de confirmación («¡PAGO RECIBIDO!», nº de pedido) y link privado en el mail (`/pedido/[token]`) para ver el estado y descargar las entradas.
- Mercado Pago cobra comisión por venta. Joaquín lo sabe y lo aceptó.

### Eventos con invitación (decidido con Joaquín)
- Cada evento tiene un **acceso** (`events.acceso`) que elige y cambia siempre el admin:
  - `publico`: compra cualquiera;
  - `lista`: **lista de invitados** por evento (`event_guests`): mail, nombre y **máximo de entradas** (entre todos sus pedidos). Solo compra quien está en la lista;
  - `clave`: **palabra clave** del evento (`events.clave_acceso`). Se compara sin mayúsculas, acentos ni espacios de más (`clave_normalizada`), `crear_pedido_web` la vuelve a controlar y los intentos tienen límite por IP. Los RRPP la ven en `/rrpp/invitados` para compartirla.
- Con lista, la página pide primero el mail; si está, muestra «Invitación para…» y el formulario con el mail fijo y el tope. Con clave, pide la palabra y después el formulario. Las consultas tienen límite por IP.
- La lista la cargan el admin y **cada RRPP** (solo ve y edita la suya). Lo que invita un RRPP queda **a su nombre** para la comisión. El admin puede poner un **tope de invitados por RRPP** (`sellers.max_invitados`, por evento).
- **«¿Quién te vendió?»** se puede ocultar por evento (`events.mostrar_rrpp`); oculto, el link `/?rrpp=` igual asigna la venta.
- La **comisión** por tipo de entrada solo la cambia el admin (RLS).

### RRPP (vendedores)
- Se registran con usuario y contraseña desde `/ingresar` y quedan **pendientes** hasta que el admin los aprueba.
- Cada RRPP ve **solo lo suyo**: ventas, comisiones y lo que debe rendir.
- **Comisión:** monto fijo por entrada, definido **por tipo de entrada y por evento**. Se gana sobre los pedidos aprobados, tanto los que cargó él como las compras web que lo eligieron.
- **Carga de ventas por el RRPP:**
  - Elige el evento (entre los que tienen ventas abiertas), los tipos y las cantidades.
  - Carga **una persona por entrada**: nombre obligatorio, mail opcional (si falta, se usa el de la persona 1; el de la persona 1 es obligatorio).
  - Cada persona recibe **su propio QR a su nombre**.
  - Indica cómo le pagaron:
    - **Efectivo:** los QR se generan **al instante**, sin aprobación, y rinde el total.
    - **Transferencia a él:** queda pendiente hasta que el admin la confirma con el RRPP por WhatsApp, y rinde el total.
    - **Transferencia a la cuenta de Nevada:** queda pendiente hasta que el admin ve el ingreso. **No rinde.**
- **Compras en la web que lo eligieron:** el comprador le paga directo a Nevada, así que el RRPP **no rinde**, pero **sí cobra comisión**.
- **Rendición:**
  - El RRPP siempre rinde **el total** de lo que cobró a su nombre. La comisión se le paga aparte, después.
  - La rendición se cuenta por separado: **efectivo** y **transferencias a su nombre**.
- Panel del RRPP:
  - entradas vendidas, vendido, comisión generada / cobrada / pendiente;
  - «Tenés que rendir», con efectivo y transferencias por separado;
  - su link personal y sus ventas, con los QR de las que cargó.

### Admin
- Ve todo. **Solo el admin tiene la Puerta** (el escáner).
- **Eventos:**
  - **Crear:** se crea como borrador con General y +25 por defecto, sin publicar.
  - **Editar:**
    - datos: nombre, DJ o subtítulo, fecha, lugar, ciudad, descripción y flyer;
    - tipos de entrada **libres**: agregar, renombrar, cambiar precio, cupo y comisión, y ponerlos o sacarlos de la venta;
    - un tipo con ventas no se borra, se pasa a «no a la venta»;
    - el cupo no puede quedar por debajo de lo vendido.
  - **Duplicar** un evento.
  - **Eliminar**, solo si no tiene ventas y con confirmación.
  - Poner un evento en la página o sacarlo, y abrir o cerrar sus ventas.
  - Todo el panel trabaja sobre el evento elegido en un selector arriba.
- **Por aprobar:** compras web, transferencias a Nevada y transferencias al RRPP. Botones Aprobar (emite y envía los QR) y Rechazar.
- **Ventas por vendedor:**
  - filtros por vendedor (todos, sin RRPP o un RRPP), estado (por aprobar, aprobado, rechazado) y alcance (este evento o todos), más búsqueda por comprador o número de pedido;
  - resumen de lo filtrado: pedidos, entradas aprobadas, vendido y comisión generada;
  - el botón «Ver ventas» en Comisiones y en Usuarios abre este filtro con ese RRPP.
- **Comisiones y rendiciones:**
  - por RRPP: generada, pagada y pendiente, con «Pagar»;
  - rendiciones con lo que debe en efectivo y en transferencias, con «Recibí» (montos separados);
  - historial de movimientos.
- **RRPP y accesos:** pedidos de acceso (aprobar o rechazar) y lista de usuarios.
- **Entradas y QR:** emitidas, usadas y anuladas, con opción de anular.

### Puerta (solo admin, `/admin/puerta`)
- Cámara del celular leyendo en vivo (`html5-qrcode`). Resultado grande y en color:
  - **VÁLIDA:** verde.
  - **YA UTILIZADA:** naranja, con la hora del primer ingreso.
  - **INVÁLIDA:** rojo.
  - **ANULADA:** gris.
- Validación **atómica en el servidor**: si dos celulares leen la misma entrada, solo el primero entra.
- Contador de ingresos y campo para escribir el código a mano.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind 4 · Supabase (Postgres + Auth + Storage + RLS) · Zod · Mercado Pago Checkout Pro con webhooks firmados · Resend · QR con token aleatorio firmado con HMAC · Vercel.

## Estado actual

**Hecho (rama `etapa-1-venta`):**
- **Etapa 1, página pública de venta** (`src/app/page.tsx`, `src/components/TicketForm.tsx`):
  - diseño Nevada, tipos de entrada, datos del comprador, selector de RRPP con `?rrpp=`, total, ventas cerradas o agotadas;
  - el botón de pago está **deshabilitado a propósito** (`checkoutEnabled={false}`) hasta tener pedidos y Mercado Pago;
  - sin Supabase muestra una vista previa con datos de ejemplo (`src/lib/storefront.ts`).
- **Etapa 2, pedidos y base de datos:**
  - Migraciones `supabase/migrations/0001…0006`: modelo completo de `docs/ARQUITECTURA.md` (varios eventos con uno `publicado`, tipos libres con `comision_rrpp`, perfiles, accesos, RRPP, pedidos, items, personas, pagos, entradas, ingresos, comisiones, rendiciones, mails y auditoría inmutable), RLS en todas las tablas y datos iniciales.
  - El público no lee tablas: solo las vistas `storefront_*` (solo lectura, sin comisiones ni cupos totales).
  - `crear_pedido_web()` (solo `service_role`): valida evento, ventas abiertas, tipos, cantidades y RRPP; calcula el total con los precios de la base; reserva cupo bloqueando los tipos (no sobrevende); es idempotente por `idempotency_key`; limita pedidos por IP y por mail. Lo vendido se calcula desde los pedidos (`ticket_type_ocupacion`); una compra web sin pagar reserva 30 minutos (`vence_en`).
  - Link privado `/pedido/[token]`: token = HMAC(`PEDIDO_TOKEN_SECRET`, clave de idempotencia); a la base llega solo su SHA-256 (`pedido_por_token()`). Sin indexar y sin Referer.
  - Server action `src/app/actions/pedidos.ts`; errores `NEV:código` de la base traducidos al comprador.
  - `PEDIDOS_DE_PRUEBA=true` habilita «Registrar pedido de prueba» (sin cobro) hasta la etapa 5; nunca en la producción de Vercel.
  - Pruebas: `scripts/probar-base.sh` (PostgreSQL local con una imitación mínima de Supabase): permisos, cupo, idempotencia, límites, vencimientos y 10 compras simultáneas por la última entrada.
- Documentación completa en `docs/`.

- **Etapa 3, panel de vendedores** y **eventos con invitación:**
  - Migración `0007_rrpp_ventas.sql`: `cargar_venta_rrpp()` (el RRPP sale de `auth.uid()`; efectivo emite al instante, transferencias quedan `por_confirmar`), `emitir_entradas()` (un QR por persona, comisión, sin doble emisión), `panel_rrpp()`, `email_de_usuario()`. Invitados, tope y `verificar_invitacion()` en 0003–0005.
  - Supabase Auth con cookies HttpOnly (`src/lib/supabase/server.ts`, `src/middleware.ts` en runtime Node). `/ingresar` (usuario o mail; pedir acceso crea usuario + perfil inactivo + pedido pendiente con la API de admin), `/rrpp` (métricas, comisiones, a rendir, link, ventas con QR, carga de ventas), `/rrpp/invitados`, `/admin` provisorio.
  - QR: `NEV1.<qr_token>.<HMAC>` con `QR_SIGNING_SECRET` (`src/lib/qr.ts`); la Puerta tiene que verificar la firma.
  - Pruebas: `supabase/tests/invitaciones_y_rrpp.sql` (114 controles en total con `scripts/probar-base.sh`). Probado de punta a punta con Supabase Auth (GoTrue) y PostgREST locales y navegador real.

- **Etapa 4, admin:**
  - Migración `0008_admin.sql`: todo cambio del admin pasa por funciones `admin_*` (verifican `es_admin()`, aplican las reglas y escriben `audit_log`); el navegador ya no escribe directo en `events`, `ticket_types`, `sellers`, `profiles` ni `access_requests`. Resúmenes: `admin_resumen_evento()`, `admin_saldos_rrpp()`.
  - **Doble verificación obligatoria del admin:** `es_admin()` exige `aal2` en el JWT. `/ingresar/verificacion` da de alta la app (TOTP de Supabase Auth) o pide el código; `requireAdmin()` la exige en cada página.
  - Panel `/admin` con selector de evento (cookie): Resumen, Eventos (crear, editar datos, acceso y palabra clave, «¿Quién te vendió?», tipos libres, duplicar, eliminar sin ventas, poner en la página, abrir/cerrar ventas), Por aprobar (emite los QR), Ventas por vendedor (filtros), Comisiones y rendiciones, RRPP y accesos, Invitados, Entradas (anular) y Auditoría. Avisos de confirmación abajo de la pantalla.
  - El comprador ve sus entradas con QR en `/pedido/[token]` cuando el pedido está aprobado (el mail llega en la etapa 6).
  - Pruebas: `supabase/tests/admin.sql` (159 controles en total) y pruebas con navegador de todo el panel.

**Siguiente, en orden** (ver la tabla de etapas en ARQUITECTURA):
1. **Etapa 5:** Mercado Pago Checkout Pro y webhook. La preferencia tiene que vencer junto con la reserva (`vence_en`, 30 minutos) y excluir medios de pago diferidos (Rapipago, Pago Fácil); un pago que llegue con el pedido ya vencido se acepta solo si queda cupo, y si no, se devuelve.
2. **Etapa 6:** entradas por mail (QR, PDF con diseño Nevada, Resend).
3. **Etapa 7:** Puerta.
4. **Etapa 8:** pruebas de permisos, revisión de RLS y despliegue.

Trabajá por etapas, mostrando el avance, y cada etapa en commits claros.

## Cuentas que faltan (las tiene que crear Joaquín)

- **Supabase:** URL del proyecto, `anon key` y `service_role key` (esta última solo en el servidor).
- **Mercado Pago:** credenciales de prueba y después de producción, más la clave secreta del webhook.
- **Resend,** con el dominio verificado.
- **Vercel,** conectado al repo.
- **Dominio** `nevadaproducciones.com` (pasos en el README).

Las variables están listadas en `.env.example`. Nunca se suben al repo.

## Cómo correrlo

```bash
npm install
cp .env.example .env.local   # completar cuando existan las cuentas
npm run dev                  # http://localhost:3000
```
