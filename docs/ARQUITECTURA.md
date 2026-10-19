# Nevada Producciones 2026 — Arquitectura propuesta

Arquitectura, modelo de datos y pantallas (aprobada). Etapa 1 hecha; el resto se construye por etapas. La demo de referencia está en [`demo/nevada-demo.html`](demo/nevada-demo.html).

---

## 1. Arquitectura general

```
                 ┌──────────────────────────────────────────────┐
  Navegador ───▶ │  Next.js 15 (App Router) + TypeScript        │
  (cliente,      │  desplegado en Vercel                        │
  RRPP,          │                                              │
  admin)         │  • Páginas públicas  /                       │
                 │  • Paneles privados  /rrpp  /admin (+puerta) │
                 │  • Server Actions y Route Handlers           │
                 │    (toda la lógica sensible corre acá)       │
                 └──────┬───────────────┬───────────────┬───────┘
                        │               │               │
              ┌─────────▼──────┐ ┌──────▼──────┐ ┌──────▼────────┐
              │ Supabase       │ │ Mercado Pago│ │ Resend        │
              │ • PostgreSQL   │ │ Checkout Pro│ │ (email        │
              │ • Auth         │ │ + webhooks  │ │ transaccional)│
              │ • Storage      │ └─────────────┘ └───────────────┘
              │   privado      │
              │ • RLS          │
              └────────────────┘
```

Decisiones clave:

| Tema | Elección | Por qué |
|---|---|---|
| Framework | Next.js 15 + TypeScript | Lo pediste; server actions permiten no exponer claves |
| Base de datos | Supabase PostgreSQL | Transacciones reales, RLS, funciones SQL atómicas |
| Accesos | Supabase Auth (email + contraseña) | Contraseñas con hash, sesiones seguras; nunca guardamos contraseñas nosotros |
| Permisos | Rol en tabla `profiles` + políticas RLS + chequeo en servidor | Doble barrera: aunque alguien manipule el navegador, la base rechaza |
| Pagos | Mercado Pago Checkout Pro + notificaciones (webhook) firmadas + aprobación del admin | El pedido pasa a *pagado* solo cuando MP lo confirma al servidor (nunca porque el cliente volvió a la página). Las entradas se liberan recién cuando el admin aprueba |
| Comprobantes | Supabase Storage, bucket privado con URLs firmadas temporales | Nadie ve un comprobante sin permiso |
| Email | Resend (alternativa: SMTP propio) | API simple, registro de entregas |
| QR | Token aleatorio de 128 bits firmado (HMAC), no el ID de la entrada | No se puede adivinar ni fabricar un QR válido |
| PDF del ticket | `@react-pdf/renderer` en servidor | Ticket con diseño Nevada descargable y adjunto al mail |
| Escáner | `html5-qrcode` en el navegador del celular | No requiere instalar app |
| Hosting | Vercel (app) + Supabase (datos) | Planes gratuitos alcanzan para el volumen de Nevada |

### Roles

| Rol | Acceso | Puede | No puede |
|---|---|---|---|
| Cliente (sin cuenta) | Público | Ver evento y precios, comprar, ver su pedido | Ver nada de otros compradores ni datos internos |
| RRPP | Usuario y contraseña; pide acceso y el admin lo aprueba | Ver solo sus ventas, comisiones y lo que debe rendir; cargar ventas si está habilitado | Ver otros RRPP, aprobar pagos, emitir entradas por transferencia, tocar comisiones, usar la Puerta |
| Admin | Usuario, contraseña y 2FA | Todo, incluido el **escáner de puerta** (exclusivo del admin) | — |

Detalle completo en [`SEGURIDAD.md`](SEGURIDAD.md).

---

## 2. Modelo de datos

### Estados (independientes entre sí)

- **Pedido** (`orders.status`): compra web `pendiente_pago` → `pagado` → `aprobado`; venta de RRPP por transferencia `por_confirmar` → `aprobado`; venta de RRPP en efectivo directo `aprobado` · o `rechazado` / `cancelado` / `vencido` (compra web que no se pagó en 30 minutos: libera el cupo). Al aprobar se emiten las entradas.
- **Pago** (`payments.status`): `iniciado` → `pendiente` | `acreditado` | `rechazado` | `reembolsado` (lo define Mercado Pago)
- **Entrada** (`tickets.status`): `valida` → `usada` · o `anulada`
- **Email** (`email_log.status`): `en_cola` → `enviado` | `fallido`

Regla de coherencia: solo se crean filas en `tickets` cuando el pedido pasa a `aprobado` y existe un pago `acreditado`. Eso lo hace **una única función SQL** (`emit_tickets(order_id)`) que bloquea el pedido y no vuelve a emitir si ya hay entradas (evita dobles emisiones).

### Tablas

```
profiles            id (= auth.users.id), nombre, rol [admin|rrpp], activo, creado_en

access_requests     id, nombre, usuario, whatsapp, estado [pendiente|aprobada|rechazada], revisado_por, creado_en

events              id, nombre, subtitulo (DJ), fecha_inicio, lugar, direccion, ciudad, descripcion,
                    publicado (es el evento de la página de venta; solo uno a la vez), ventas_abiertas,
                    acceso [publico|lista|clave], clave_acceso (palabra clave),
                    mostrar_rrpp («¿Quién te vendió?» visible),
                    flyer_path (Storage público, imagen reducida),
                    creado_por, actualizado_por, actualizado_en
                    (se pueden crear, editar y duplicar; se eliminan solo si no tienen ventas)

ticket_types        id, event_id, nombre, descripcion, precio, cupo_total, comision_rrpp,
                    max_por_compra, en_venta, orden
                    (lo vendido no se guarda: se calcula desde los pedidos en ticket_type_ocupacion)
                    (tipos libres por evento: General, +25, VIP, preventa…; un tipo con ventas
                    no se borra, se pasa a en_venta = false; el cupo no baja de lo vendido)

sellers             id, profile_id, nombre_publico, codigo (link /?rrpp=), puede_cargar_ventas,
                    max_invitados (tope por evento; null = sin tope), activo

event_guests        id, event_id, email (único por evento), nombre, max_entradas, seller_id (null = Nevada),
                    creado_por, activo (lista de invitados de los eventos con acceso = lista)

orders              id, event_id, numero (NEV-000123), comprador_nombre, comprador_email,
                    comprador_whatsapp, seller_id (null = venta directa), invitado_id,
                    origen [web|promotor], metodo_pago [mercadopago|efectivo_rrpp|transferencia_rrpp|transferencia_nevada],
                    total, status, vence_en, idempotency_key (único), token_hash (link privado),
                    ip_hash, creado_por, revisado_por, motivo_rechazo, creado_en

order_items         id, order_id, ticket_type_id, cantidad, precio_unitario, comision_unitaria, subtotal
                    (precio y comisión congelados al momento de la venta)

order_attendees     id, order_id, order_item_id, nombre, email (ventas de RRPP: una fila por persona)

payments            id, order_id, medio [mercadopago|efectivo_promotor],
                    mp_preference_id, mp_payment_id (único), monto, status,
                    comprobante_path (storage privado), revisado_por, revisado_en,
                    motivo_rechazo, raw_webhook (jsonb)

tickets             id, order_id, order_item_id, ticket_type_id, qr_token (único),
                    titular_nombre, titular_email, status, emitido_en, anulado_por, anulado_en

checkins            id, ticket_id (único → impide doble ingreso), escaneado_por,
                    escaneado_en, dispositivo

scan_attempts       id, qr_token_leido, resultado [valida|usada|invalida|anulada],
                    escaneado_por, escaneado_en

commissions         id, order_id, seller_id, monto, status [generada|liquidada|anulada]

commission_payouts  id, seller_id, monto, fecha_pago, medio, nota, registrado_por

seller_settlements  id, seller_id, monto_efectivo, monto_transferencia, fecha, nota, registrado_por
                    (rendiciones: lo que el RRPP entrega a Nevada, contado por medio)

payout_items        payout_id, commission_id

email_log           id, order_id, tipo [entradas|reenvio|instrucciones], destinatario,
                    status, proveedor_id, error, enviado_en

audit_log           id, actor_id, accion, entidad, entidad_id, antes (jsonb),
                    despues (jsonb), creado_en
```

### Controles anti-duplicados

| Riesgo | Control |
|---|---|
| Venta duplicada (doble click, reintento) | `orders.idempotency_key` único |
| Notificación de MP repetida | `payments.mp_payment_id` único + procesamiento idempotente |
| Doble emisión de QR | `emit_tickets()` con `SELECT … FOR UPDATE` y verificación previa |
| Sobreventa | Reserva de cupo dentro de una transacción al confirmar el pedido |
| Doble ingreso (dos celulares a la vez) | `checkins.ticket_id` único + `UPDATE tickets SET status='usada' WHERE status='valida'` atómico; el segundo recibe "YA UTILIZADA" |
| Comisión modificada por un vendedor | RLS: solo admin escribe en `commissions` y `commission_payouts`; todo cambio queda en `audit_log` |

---

## 3. Pantallas

### Públicas
1. **/** — Venta del **único evento que está en la página** (el admin elige cuál; poner uno reemplaza al anterior): fondo azul noche con nieve sutil, tarjeta blanca central tipo ticket, logo Nevada, evento, fecha y lugar. Tipos de entrada con precio y selector de cantidad, datos del comprador, **«¿Quién te vendió?» (RRPP, opcional)** para asignar la comisión, total y botón «Pagar con Mercado Pago». Cada RRPP tiene un link personal (`/?rrpp=codigo`) que lo deja preseleccionado. Mensaje claro si las ventas están cerradas o agotadas.
2. **/pedido/[token privado]** — Seguimiento del comprador, sin cuenta: al pagar ve la confirmación con su número de pedido, y el mail trae este link privado para ver el estado y descargar las entradas cuando quiera. Estados: «pago en verificación», «pagado, esperando aprobación», «aprobado: entradas enviadas» o «rechazado». El estado sale del servidor, no del regreso del cliente.
3. **/entradas/[token]** — Descarga de las entradas (link privado enviado por mail).

### Ingreso (`/ingresar`)
Página de ingreso para RRPP y admin, **sin link visible** desde la página pública: el comprador solo ve la venta. Desde acá el RRPP también pide su acceso.

### RRPP (`/rrpp`)
4. **Ingreso** (en `/ingresar`)
5. **Mi panel** — Entradas General, +25 y total vendidas; total en $; comisión generada / pagada / pendiente; link personal de venta.
6. **Mis ventas** — Historial con estado de cada una.
7. **Cargar venta** (solo si está autorizado) — el RRPP genera la venta él mismo: tipo y cantidad de entradas y **una persona por entrada** (nombre y apellido obligatorio, mail opcional; si falta, va al mail de la persona 1), y cómo le pagó:
   - **Efectivo:** las entradas con QR se generan **al instante** (sin aprobación) y el monto queda como **deuda a rendir** del RRPP.
   - **Transferencia a la cuenta de Nevada:** queda **pendiente** hasta que el admin ve el ingreso; el RRPP **no rinde** ese dinero.
   - **Transferencia a nombre del RRPP:** queda **pendiente**; el admin la confirma con el RRPP por WhatsApp y al aprobarla se envían los QR.

   El RRPP **siempre rinde el total** de lo que cobró a su nombre (efectivo y transferencias a su cuenta); lo que se pagó directo a Nevada (compras en la web o transferencias a Nevada) no se rinde. la comisión se le paga después. Al rendir se registra por separado cuánto entregó en efectivo y cuánto en transferencias. Cada persona recibe su propia entrada con QR a su nombre. Queda **pendiente**; el admin la confirma con el RRPP por WhatsApp y al aprobarla se envían los QR al mail del comprador. Muestra la comisión que va a generar.

### Admin (`/admin`)
8. **Eventos** — lista de eventos, **crear** (queda como borrador), **duplicar**, **editar** (nombre, DJ, fecha, lugar, ciudad, descripción, flyer; tipos de entrada: agregar, renombrar, precio, cupo, comisión, a la venta sí/no, eliminar si no tiene ventas), **eliminar** (solo sin ventas, con confirmación), poner en la página de venta (reemplaza al evento anterior) o sacarlo, abrir / cerrar ventas. Todo el panel trabaja sobre el evento seleccionado arriba.
   **Resumen** — vendidas por tipo, recaudado, pendientes de revisión, ranking de RRPP.
9. **Ventas por vendedor** — filtro por vendedor (todos, sin RRPP o un RRPP), estado y alcance (este evento o todos) más búsqueda por comprador o número; resumen del filtro: pedidos, entradas aprobadas, vendido y comisión generada. Desde Comisiones y Usuarios, «Ver ventas» abre este filtro con el RRPP elegido.
10. **Detalle de pedido** — pagos, comprobante, aprobar / rechazar, emitir, reenviar, anular entradas.
11. **Pedidos por aprobar** — pedidos con pago acreditado por Mercado Pago (nº de operación, monto, medio) listos para aprobar y liberar los QR.
12. **Vendedores** — alta, edición, activar / desactivar, autorización para cargar ventas, desempeño comparado.
13. **Comisiones** — reglas por tipo de entrada (y por vendedor), generado / pagado / pendiente, registrar liquidación, historial.
14. **Entradas / QR** — emitidas, usadas, anuladas.
15. **Evento** — nombre, fecha, lugar, precios, cupos, abrir / cerrar ventas, datos bancarios.
16. **RRPP y accesos** (pedidos de acceso para aprobar, usuarios, desactivar) y **Auditoría**.

### Puerta (`/admin/puerta`, solo admin)
17. **Escáner** — cámara a pantalla completa; resultado grande y en color: ENTRADA VÁLIDA (verde), YA UTILIZADA (naranja, con hora del primer ingreso), INVÁLIDA (rojo), ANULADA (gris). Contador de ingresos.

---

## 4. Etapas

| # | Etapa | Resultado |
|---|---|---|
| 1 | Página pública de venta | Diseño Nevada funcionando con datos de la base |
| 2 | Pedidos y base de datos | Migraciones SQL, RLS, creación real de pedidos |
| 3 | Panel de vendedores | Login, métricas, historial, carga de ventas |
| 4 | Admin y comisiones | Gestión completa, reglas, liquidaciones, auditoría |
| 5 | Pagos | Checkout Pro con nº de pedido como referencia, webhook que marca el pago acreditado, cola de aprobación del admin |
| 6 | Entradas por email | QR, PDF con diseño Nevada, envío, reenvío, descarga |
| 7 | Escáner | Lectura con cámara y validación atómica en servidor |
| 8 | Pruebas, seguridad, despliegue | Tests de reglas críticas, revisión de RLS, deploy en Vercel |

---

## 5. Qué vas a tener que crear o pasarme

Nada de esto se simula: sin estas cuentas, esa parte queda marcada como "falta configurar".

| Necesito | Para qué | Cómo se obtiene |
|---|---|---|
| Proyecto de **Supabase** | Base de datos, logins, comprobantes | supabase.com → New project. Me pasás la URL del proyecto, la `anon key` y la `service_role key` (esta última solo va al servidor). |
| Cuenta de **Resend** + dominio | Enviar las entradas por mail | resend.com → verificar el dominio nevadaproducciones.com agregando registros DNS. Sin dominio propio solo se puede enviar a tu propio mail de prueba. |
| Cuenta de **Vercel** | Publicar la página | vercel.com → conectar el repo de GitHub. |
| Dominio **nevadaproducciones.com** | Dirección de la web (www.nevadaproducciones.com) y remitente de los mails | Comprarlo en un registrador de .com (Cloudflare, Namecheap, GoDaddy, Hostinger, etc.). Después: conectarlo en Vercel (Settings → Domains) y verificarlo en Resend. |
| Cuenta de **Mercado Pago** (vendedor) | Cobrar con Checkout Pro | mercadopago.com.ar/developers → Tus integraciones → Crear aplicación (Checkout Pro). Primero credenciales de **prueba**, después las de **producción**. También la clave secreta de webhooks. |
| Precios, cupos, fecha y lugar | Configurar el evento | Se cargan desde el panel admin. |
| Reglas de comisión | Calcular comisiones | **Monto fijo por entrada**, definido por tipo de entrada en cada evento (se configura desde el admin). |

Las claves van en variables de entorno (`.env.local` en desarrollo, panel de Vercel en producción) y nunca se suben al repo.
