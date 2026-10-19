-- Nevada Producciones
-- 0003: pedidos, pagos, entradas con QR, ingresos en puerta, comisiones, rendiciones,
-- registro de mails y auditoría.
--
-- Estados del pedido (orders.status):
--   pendiente_pago  compra web creada, esperando que Mercado Pago confirme el pago (reserva el cupo
--                   hasta vence_en)
--   pagado          Mercado Pago confirmó el pago (webhook firmado); espera la aprobación del admin
--   por_confirmar   venta de RRPP por transferencia; espera que el admin confirme el ingreso
--   aprobado        aprobado por el admin (o venta de RRPP en efectivo): entradas emitidas
--   rechazado       rechazado por el admin
--   cancelado       anulado
--   vencido         compra web que no se pagó a tiempo: libera el cupo

create sequence public.order_numero_seq;

-- ─────────────────────────────────────────────────────────────
-- Lista de invitados (eventos con acceso = 'lista')
-- Solo compra quien está en la lista, hasta max_entradas entre todos sus pedidos.
-- La cargan el admin y los RRPP; lo que invita un RRPP queda a su nombre para la comisión.
-- ─────────────────────────────────────────────────────────────
create table public.event_guests (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid        not null references public.events(id) on delete cascade,
  email        text        not null check (email = lower(email)
                                           and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                                           and char_length(email) <= 254),
  nombre       text        not null check (char_length(nombre) between 2 and 120),
  max_entradas integer     not null default 1 check (max_entradas between 1 and 20),
  seller_id    uuid        references public.sellers(id) on delete restrict, -- null = invitado por Nevada
  creado_por   uuid        references public.profiles(id) on delete set null,
  activo       boolean     not null default true,
  creado_en    timestamptz not null default now(),
  unique (event_id, email)
);

create index event_guests_seller on public.event_guests (seller_id, event_id);

-- ─────────────────────────────────────────────────────────────
-- Pedidos
-- ─────────────────────────────────────────────────────────────
create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  numero             text        not null unique
                                 default 'NEV-' || lpad(nextval('public.order_numero_seq')::text, 6, '0'),
  event_id           uuid        not null references public.events(id) on delete restrict,
  comprador_nombre   text        not null check (char_length(comprador_nombre) between 2 and 60),
  comprador_apellido text        not null check (char_length(comprador_apellido) between 2 and 60),
  comprador_email    text        not null check (comprador_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                                                 and char_length(comprador_email) <= 254),
  comprador_whatsapp text        check (comprador_whatsapp ~ '^[0-9+\s()-]{8,20}$'),
  seller_id          uuid        references public.sellers(id) on delete restrict, -- null = venta directa
  invitado_id        uuid        references public.event_guests(id) on delete restrict, -- eventos con invitación
  origen             text        not null check (origen in ('web', 'rrpp')),
  metodo_pago        text        not null check (metodo_pago in
                                 ('mercadopago', 'efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada')),
  total              integer     not null check (total >= 0),
  status             text        not null check (status in
                                 ('pendiente_pago', 'pagado', 'por_confirmar', 'aprobado',
                                  'rechazado', 'cancelado', 'vencido')),
  vence_en           timestamptz,                        -- solo compras web pendientes de pago
  idempotency_key    uuid        not null unique,        -- evita pedidos duplicados por doble click o reintento
  token_hash         text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
                                                         -- SHA-256 del link privado /pedido/[token]
  ip_hash            text,                               -- para limitar abuso, sin guardar la IP
  creado_por         uuid        references public.profiles(id) on delete set null, -- RRPP que la cargó
  creado_en          timestamptz not null default now(),
  revisado_por       uuid        references public.profiles(id) on delete set null,
  revisado_en        timestamptz,
  motivo_rechazo     text        check (char_length(motivo_rechazo) <= 500),
  actualizado_en     timestamptz not null default now(),
  -- La web cobra solo con Mercado Pago; las ventas de RRPP son siempre de un RRPP identificado.
  check ((origen = 'web') = (metodo_pago = 'mercadopago')),
  check (origen = 'web' or (seller_id is not null and creado_por is not null)),
  check ((status = 'pendiente_pago') <= (vence_en is not null))
);

create index orders_event_status on public.orders (event_id, status);
create index orders_seller on public.orders (seller_id) where seller_id is not null;
create index orders_email on public.orders (lower(comprador_email), creado_en);
create index orders_ip on public.orders (ip_hash, creado_en) where ip_hash is not null;

create trigger orders_actualizado_en
  before update on public.orders
  for each row execute function public.set_actualizado_en();

-- Precio y comisión quedan congelados al momento de la venta.
create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid    not null references public.orders(id) on delete cascade,
  ticket_type_id    uuid    not null references public.ticket_types(id) on delete restrict,
  cantidad          integer not null check (cantidad > 0),
  precio_unitario   integer not null check (precio_unitario >= 0),
  comision_unitaria integer not null default 0 check (comision_unitaria >= 0),
  subtotal          integer not null check (subtotal = cantidad * precio_unitario),
  unique (order_id, ticket_type_id)
);

create index order_items_type on public.order_items (ticket_type_id);

-- Ventas de RRPP: una persona por entrada, cada una con su QR a su nombre.
create table public.order_attendees (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  nombre        text not null check (char_length(nombre) between 2 and 120),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254)
);

create index order_attendees_order on public.order_attendees (order_id);

-- ─────────────────────────────────────────────────────────────
-- Pagos
-- ─────────────────────────────────────────────────────────────
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid        not null references public.orders(id) on delete restrict,
  medio            text        not null check (medio in
                               ('mercadopago', 'efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada')),
  mp_preference_id text,
  mp_payment_id    text        unique,                -- una notificación repetida no duplica el pago
  monto            integer     not null check (monto >= 0),
  status           text        not null check (status in
                               ('iniciado', 'pendiente', 'acreditado', 'rechazado', 'reembolsado')),
  comprobante_path text,                              -- Storage privado
  revisado_por     uuid        references public.profiles(id) on delete set null,
  revisado_en      timestamptz,
  motivo_rechazo   text        check (char_length(motivo_rechazo) <= 500),
  raw_webhook      jsonb,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create index payments_order on public.payments (order_id);

create trigger payments_actualizado_en
  before update on public.payments
  for each row execute function public.set_actualizado_en();

-- ─────────────────────────────────────────────────────────────
-- Entradas con QR y puerta
-- ─────────────────────────────────────────────────────────────
create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid        not null references public.orders(id) on delete restrict,
  order_item_id  uuid        not null references public.order_items(id) on delete restrict,
  ticket_type_id uuid        not null references public.ticket_types(id) on delete restrict,
  qr_token       text        not null unique,         -- aleatorio de 128 bits firmado con HMAC (etapa 6)
  titular_nombre text        not null,
  titular_email  text        not null,
  status         text        not null default 'valida' check (status in ('valida', 'usada', 'anulada')),
  emitido_en     timestamptz not null default now(),
  usada_en       timestamptz,
  anulado_por    uuid        references public.profiles(id) on delete set null,
  anulado_en     timestamptz
);

create index tickets_order on public.tickets (order_id);

-- ticket_id único: imposible registrar dos ingresos con la misma entrada.
create table public.checkins (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid        not null unique references public.tickets(id) on delete restrict,
  escaneado_por uuid        references public.profiles(id) on delete set null,
  escaneado_en  timestamptz not null default now(),
  dispositivo   text
);

create table public.scan_attempts (
  id             bigint generated always as identity primary key,
  qr_token_leido text        not null,
  resultado      text        not null check (resultado in ('valida', 'usada', 'invalida', 'anulada')),
  escaneado_por  uuid        references public.profiles(id) on delete set null,
  escaneado_en   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Comisiones, pagos de comisiones y rendiciones de los RRPP
-- ─────────────────────────────────────────────────────────────
create table public.commissions (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid        not null unique references public.orders(id) on delete restrict,
  seller_id uuid        not null references public.sellers(id) on delete restrict,
  monto     integer     not null check (monto >= 0),
  status    text        not null default 'generada' check (status in ('generada', 'liquidada', 'anulada')),
  creado_en timestamptz not null default now()
);

create index commissions_seller on public.commissions (seller_id, status);

create table public.commission_payouts (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid        not null references public.sellers(id) on delete restrict,
  monto          integer     not null check (monto > 0),
  fecha_pago     date        not null default current_date,
  medio          text        not null check (medio in ('efectivo', 'transferencia')),
  nota           text        check (char_length(nota) <= 500),
  registrado_por uuid        references public.profiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);

create table public.payout_items (
  payout_id     uuid not null references public.commission_payouts(id) on delete restrict,
  commission_id uuid not null unique references public.commissions(id) on delete restrict,
  primary key (payout_id, commission_id)
);

-- Lo que el RRPP le entrega a Nevada de lo que cobró a su nombre, contado por medio.
create table public.seller_settlements (
  id                  uuid primary key default gen_random_uuid(),
  seller_id           uuid        not null references public.sellers(id) on delete restrict,
  monto_efectivo      integer     not null default 0 check (monto_efectivo >= 0),
  monto_transferencia integer     not null default 0 check (monto_transferencia >= 0),
  fecha               date        not null default current_date,
  nota                text        check (char_length(nota) <= 500),
  registrado_por      uuid        references public.profiles(id) on delete set null,
  creado_en           timestamptz not null default now(),
  check (monto_efectivo + monto_transferencia > 0)
);

-- ─────────────────────────────────────────────────────────────
-- Mails enviados
-- ─────────────────────────────────────────────────────────────
create table public.email_log (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid        references public.orders(id) on delete set null,
  tipo         text        not null check (tipo in ('entradas', 'reenvio', 'pedido_recibido')),
  destinatario text        not null,
  status       text        not null default 'en_cola' check (status in ('en_cola', 'enviado', 'fallido')),
  proveedor_id text,
  error        text,
  creado_en    timestamptz not null default now(),
  enviado_en   timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- Auditoría: nadie la puede modificar ni borrar, ni el admin.
-- ─────────────────────────────────────────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid        references public.profiles(id) on delete set null,
  accion     text        not null,
  entidad    text        not null,
  entidad_id text,
  antes      jsonb,
  despues    jsonb,
  creado_en  timestamptz not null default now()
);

create or replace function public.audit_log_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El registro de auditoría no se puede modificar ni borrar';
end;
$$;

create trigger audit_log_sin_cambios
  before update or delete on public.audit_log
  for each row execute function public.audit_log_inmutable();

create trigger audit_log_sin_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_inmutable();
