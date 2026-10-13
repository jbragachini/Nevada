# Nevada Producciones 2026 — Arquitectura propuesta

Etapa 0: arquitectura, modelo de datos y pantallas. Nada de esto está construido todavía; es la propuesta a aprobar antes de empezar a programar.

---

## 1. Arquitectura general

```
                 ┌──────────────────────────────────────────────┐
  Navegador ───▶ │  Next.js 15 (App Router) + TypeScript        │
  (cliente,      │  desplegado en Vercel                        │
  vendedor,      │                                              │
  admin,         │  • Páginas públicas  /                       │
  puerta)        │  • Paneles privados  /vendedor /admin /puerta│
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

---|---|---|
| Cliente (sin cuenta) | Ver evento y precios, comprar, subir comprobante de su pedido | Ver nada de otros compradores ni datos internos |
| Vendedor | Ver sus ventas y comisiones; cargar ventas externas si está autorizado | Ver ventas de otros, aprobar pagos, emitir entradas, tocar comisiones |
| Puerta | Escanear QR y ver resultado | Ver ventas, comisiones o modificar nada |
| Admin | Todo | — |

---

## 2. Modelo de datos

### Estados (independientes entre sí)

- **Pedido** (`orders.status`): `borrador` → `pendiente_pago` → `pagado` → `aprobado` → `emitido` · o `cancelado` / `vencido`
- **Pago** (`payments.status`): `iniciado` → `pendiente` | `acreditado` | `rechazado` | `reembolsado` (lo define Mercado Pago)
- **Entrada** (`tickets.status`): `valida` → `usada` · o `anulada`
- **Email** (`email_log.status`): `en_cola` → `enviado` | `fallido`

Regla de coherencia: solo se crean filas en `tickets` cuando el pedido pasa a `aprobado` y existe un pago `acreditado`. Eso lo hace **una única función SQL** (`emit_tickets(order_id)`) que bloquea el pedido y no vuelve a emitir si ya hay entradas (evita dobles emisiones).

### Tablas

```
profiles            id (= auth.users.id), nombre, rol [admin|rrpp], activo, creado_en

access_requests     id, nombre, usuario, whatsapp, estado [pendiente|aprobada|rechazada], revisado_por, creado_en

event_settings      id, nombre, fecha, lugar, direccion, ventas_abiertas,
                    demora_revision_txt, actualizado_por, actualizado_en

ticket_types        id, codigo [general|mas25], nombre, precio, cupo_total,
                    vendidas (calculado), activo, orden

sellers             id, profile_id, codigo_promotor (para link ?ref=), puede_cargar_ventas, activo

commission_rules    id, ticket_type_id, seller_id (null = regla general),
                    monto_fijo (pesos por entrada), vigente_desde

orders              id, numero (NEV-000123), comprador_nombre, comprador_email,
                    comprador_whatsapp, seller_id (null = venta directa),
                    origen [web|promotor], metodo_pago [mercadopago|efectivo_rrpp|transferencia_rrpp|transferencia_nevada],
                    total, status, idempotency_key (único), creado_en

order_items         id, order_id, ticket_type_id, cantidad, precio_unitario, subtotal

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
1. **/** — Venta: fondo azul noche con nieve sutil, tarjeta blanca central tipo ticket, logo Nevada, evento, fecha y lugar. Tipos de entrada con precio y selector de cantidad, datos del comprador, **«¿Quién te vendió?» (RRPP, opcional)** para asignar la comisión, total y botón «Pagar con Mercado Pago». Cada RRPP tiene un link personal (`/?rrpp=codigo`) que lo deja preseleccionado. Mensaje claro si las ventas están cerradas o agotadas.
2. **/pedido/[numero]** — Estado del pedido al volver de Mercado Pago: «pago en verificación», «pagado, esperando aprobación», «aprobado: entradas enviadas» o «rechazado». El estado sale del servidor, no del regreso del cliente.
3. **/entradas/[token]** — Descarga de las entradas (link privado enviado por mail).

### Vendedor (`/vendedor`)
4. **Login**
5. **Mi panel** — Entradas General, +25 y total vendidas; total en $; comisión generada / pagada / pendiente; link personal de venta.
6. **Mis ventas** — Historial con estado de cada una.
7. **Cargar venta** (solo si está autorizado) — el RRPP genera la venta él mismo: tipo y cantidad de entradas y **una persona por entrada** (nombre y apellido obligatorio, mail opcional; si falta, va al mail de la persona 1), y cómo le pagó:
   - **Efectivo:** las entradas con QR se generan **al instante** (sin aprobación) y el monto queda como **deuda a rendir** del RRPP.
   - **Transferencia a la cuenta de Nevada:** queda **pendiente** hasta que el admin ve el ingreso; el RRPP **no rinde** ese dinero.
   - **Transferencia a nombre del RRPP:** queda **pendiente**; el admin la confirma con el RRPP por WhatsApp y al aprobarla se envían los QR.

   El RRPP **siempre rinde el total** de lo que cobró a su nombre (efectivo y transferencias a su cuenta); lo que se pagó directo a Nevada (compras en la web o transferencias a Nevada) no se rinde. la comisión se le paga después. Al rendir se registra por separado cuánto entregó en efectivo y cuánto en transferencias. Cada persona recibe su propia entrada con QR a su nombre. Queda **pendiente**; el admin la confirma con el RRPP por WhatsApp y al aprobarla se envían los QR al mail del comprador. Muestra la comisión que va a generar.

### Admin (`/admin`)
8. **Resumen** — vendidas por tipo, recaudado, pendientes de revisión, ranking de vendedores.
9. **Ventas** — búsqueda por comprador / vendedor / número; filtros por tipo, fecha, método, estado; directa vs. promotor.
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
| Reglas de comisión | Calcular comisiones | **Monto fijo por entrada**: $X por General y $Y por +25 (se configura desde el admin). |
| Imagen de referencia de Tokyo Club | Ajustar el diseño | No me llegó adjunta; si me la pasás la tomo como guía visual. |

Las claves van en variables de entorno (`.env.local` en desarrollo, panel de Vercel en producción) y nunca se suben al repo.
