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
| Pagos | Mercado Pago Checkout Pro + webhook firmado | El pago se acredita solo cuando MP lo confirma al servidor |
| Comprobantes | Supabase Storage, bucket privado con URLs firmadas temporales | Nadie ve un comprobante sin permiso |
| Email | Resend (alternativa: SMTP propio) | API simple, registro de entregas |
| QR | Token aleatorio de 128 bits firmado (HMAC), no el ID de la entrada | No se puede adivinar ni fabricar un QR válido |
| PDF del ticket | `@react-pdf/renderer` en servidor | Ticket con diseño Nevada descargable y adjunto al mail |
| Escáner | `html5-qrcode` en el navegador del celular | No requiere instalar app |
| Hosting | Vercel (app) + Supabase (datos) | Planes gratuitos alcanzan para el volumen de Nevada |

### Roles

| Rol | Puede | No puede |
|---|---|---|
| Cliente (sin cuenta) | Ver evento y precios, comprar, subir comprobante de su pedido | Ver nada de otros compradores ni datos internos |
| Vendedor | Ver sus ventas y comisiones; cargar ventas externas si está autorizado | Ver ventas de otros, aprobar pagos, emitir entradas, tocar comisiones |
| Puerta | Escanear QR y ver resultado | Ver ventas, comisiones o modificar nada |
| Admin | Todo | — |

---

## 2. Modelo de datos

### Estados (independientes entre sí)

- **Pedido** (`orders.status`): `borrador` → `pendiente_pago` → `pagado` → `aprobado` → `emitido` · o `cancelado` / `vencido`
- **Pago** (`payments.status`): `iniciado` → `pendiente_revision` | `acreditado` | `rechazado` | `reembolsado`
- **Entrada** (`tickets.status`): `valida` → `usada` · o `anulada`
- **Email** (`email_log.status`): `en_cola` → `enviado` | `fallido`

Regla de coherencia: solo se crean filas en `tickets` cuando el pedido pasa a `aprobado` y existe un pago `acreditado`. Eso lo hace **una única función SQL** (`emit_tickets(order_id)`) que bloquea el pedido y no vuelve a emitir si ya hay entradas (evita dobles emisiones).

### Tablas

```
profiles            id (= auth.users.id), nombre, rol [admin|vendedor|puerta], activo, creado_en

event_settings      id, nombre, fecha, lugar, direccion, ventas_abiertas,
                    datos_bancarios (alias, cbu, titular, banco), actualizado_por, actualizado_en

ticket_types        id, codigo [general|mas25], nombre, precio, cupo_total,
                    vendidas (calculado), activo, orden

sellers             id, profile_id, codigo_promotor (para link ?ref=), puede_cargar_ventas, activo

commission_rules    id, ticket_type_id, seller_id (null = regla general),
                    tipo [fijo|porcentaje], valor, vigente_desde

orders              id, numero (NEV-000123), comprador_nombre, comprador_email,
                    comprador_whatsapp, seller_id (null = venta directa),
                    origen [web|promotor], metodo_pago [mercadopago|transferencia|efectivo],
                    total, status, idempotency_key (único), creado_en

order_items         id, order_id, ticket_type_id, cantidad, precio_unitario, subtotal

payments            id, order_id, proveedor [mercadopago|transferencia|efectivo],
                    mp_preference_id, mp_payment_id (único), monto, status,
                    comprobante_path (storage privado), revisado_por, revisado_en,
                    motivo_rechazo, raw_webhook (jsonb)

tickets             id, order_id, order_item_id, ticket_type_id, qr_token (único),
                    titular_nombre, status, emitido_en, anulado_por, anulado_en

checkins            id, ticket_id (único → impide doble ingreso), escaneado_por,
                    escaneado_en, dispositivo

scan_attempts       id, qr_token_leido, resultado [valida|usada|invalida|anulada],
                    escaneado_por, escaneado_en

commissions         id, order_id, seller_id, monto, status [generada|liquidada|anulada]

commission_payouts  id, seller_id, monto, fecha_pago, medio, nota, registrado_por

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
| Webhook de MP repetido | `payments.mp_payment_id` único + procesamiento idempotente |
| Doble emisión de QR | `emit_tickets()` con `SELECT … FOR UPDATE` y verificación previa |
| Sobreventa | Reserva de cupo dentro de una transacción al confirmar el pedido |
| Doble ingreso (dos celulares a la vez) | `checkins.ticket_id` único + `UPDATE tickets SET status='usada' WHERE status='valida'` atómico; el segundo recibe "YA UTILIZADA" |
| Comisión modificada por un vendedor | RLS: solo admin escribe en `commissions` y `commission_payouts`; todo cambio queda en `audit_log` |

---

## 3. Pantallas

### Públicas
1. **/** — Venta: fondo azul noche con nieve sutil, tarjeta blanca central tipo ticket, logo Nevada, evento, fecha y lugar. Tipos de entrada con precio y selector de cantidad, total, datos del comprador, elección de medio de pago. Mensaje claro si las ventas están cerradas o agotadas.
2. **/pedido/[numero]** — Estado del pedido: si es transferencia, datos bancarios y carga de comprobante; si es Mercado Pago, "procesando / aprobado / rechazado" según lo que confirme el servidor.
3. **/entradas/[token]** — Descarga de las entradas (link privado enviado por mail).

### Vendedor (`/vendedor`)
4. **Login**
5. **Mi panel** — Entradas General, +25 y total vendidas; total en $; comisión generada / pagada / pendiente; link personal de venta.
6. **Mis ventas** — Historial con estado de cada una.
7. **Cargar venta** (solo si está autorizado) — comprador, tipo, cantidad, método de pago. Queda pendiente de aprobación del admin.

### Admin (`/admin`)
8. **Resumen** — vendidas por tipo, recaudado, pendientes de revisión, ranking de vendedores.
9. **Ventas** — búsqueda por comprador / vendedor / número; filtros por tipo, fecha, método, estado; directa vs. promotor.
10. **Detalle de pedido** — pagos, comprobante, aprobar / rechazar, emitir, reenviar, anular entradas.
11. **Transferencias por revisar** — cola de comprobantes.
12. **Vendedores** — alta, edición, activar / desactivar, autorización para cargar ventas, desempeño comparado.
13. **Comisiones** — reglas por tipo de entrada (y por vendedor), generado / pagado / pendiente, registrar liquidación, historial.
14. **Entradas / QR** — emitidas, usadas, anuladas.
15. **Evento** — nombre, fecha, lugar, precios, cupos, abrir / cerrar ventas, datos bancarios.
16. **Usuarios de puerta** y **Auditoría**.

### Puerta (`/puerta`)
17. **Login**
18. **Escáner** — cámara a pantalla completa; resultado grande y en color: ENTRADA VÁLIDA (verde), YA UTILIZADA (naranja, con hora del primer ingreso), INVÁLIDA (rojo), ANULADA (gris). Contador de ingresos.

---

## 4. Etapas

| # | Etapa | Resultado |
|---|---|---|
| 1 | Página pública de venta | Diseño Nevada funcionando con datos de la base |
| 2 | Pedidos y base de datos | Migraciones SQL, RLS, creación real de pedidos |
| 3 | Panel de vendedores | Login, métricas, historial, carga de ventas |
| 4 | Admin y comisiones | Gestión completa, reglas, liquidaciones, auditoría |
| 5 | Pagos | Checkout Pro + webhook; transferencias con comprobante y revisión |
| 6 | Entradas por email | QR, PDF con diseño Nevada, envío, reenvío, descarga |
| 7 | Escáner | Lectura con cámara y validación atómica en servidor |
| 8 | Pruebas, seguridad, despliegue | Tests de reglas críticas, revisión de RLS, deploy en Vercel |

---

## 5. Qué vas a tener que crear o pasarme

Nada de esto se simula: sin estas cuentas, esa parte queda marcada como "falta configurar".

| Necesito | Para qué | Cómo se obtiene |
|---|---|---|
| Proyecto de **Supabase** | Base de datos, logins, comprobantes | supabase.com → New project. Me pasás la URL del proyecto, la `anon key` y la `service_role key` (esta última solo va al servidor). |
| Cuenta de **Mercado Pago** (vendedor) | Cobrar con Checkout Pro | mercadopago.com.ar/developers → Tus integraciones → Crear aplicación (Checkout Pro). Primero credenciales de **prueba**, después las de **producción**. También la clave secreta de webhooks. |
| Cuenta de **Resend** + dominio | Enviar las entradas por mail | resend.com → verificar un dominio (ej. nevadaproducciones.com.ar) agregando registros DNS. Sin dominio propio solo se puede enviar a tu propio mail de prueba. |
| Cuenta de **Vercel** | Publicar la página | vercel.com → conectar el repo de GitHub. |
| **Dominio** (opcional pero recomendado) | Dirección propia y mails confiables | nic.ar o similar. |
| Datos bancarios | Mostrar para transferencias | Alias / CBU / titular / banco. |
| Precios, cupos, fecha y lugar | Configurar el evento | Se cargan desde el panel admin. |
| Reglas de comisión | Calcular comisiones | Ej.: $X fijo por entrada General, $Y por +25, o un %. |
| Imagen de referencia de Tokyo Club | Ajustar el diseño | No me llegó adjunta; si me la pasás la tomo como guía visual. |

Las claves van en variables de entorno (`.env.local` en desarrollo, panel de Vercel en producción) y nunca se suben al repo.
