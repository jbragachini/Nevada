-- Nevada Producciones: base completa (generado por scripts/armar-sql-unico.sh).
-- Pegar entero en Supabase → SQL Editor → Run, UNA sola vez, en un proyecto nuevo.

-- ═════════════ 0001_evento_y_entradas.sql ═════════════
-- Nevada Producciones
-- 0001: eventos y tipos de entrada.
-- Varios eventos editables; uno solo «en la página» (publicado) a la vez.
-- Acceso de cada evento, lo elige el admin y lo cambia cuando quiera:
--   publico  compra cualquiera
--   lista    solo compra quien está en la lista de invitados (por mail), hasta su máximo
--   clave    solo compra quien sabe la palabra clave del evento
-- También puede mostrar u ocultar «¿Quién te vendió?».
-- Tipos de entrada libres por evento, con precio, cupo y comisión fija para el RRPP.

create extension if not exists pgcrypto;

-- Mantiene actualizado_en al día en cada UPDATE.
create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Eventos
-- ─────────────────────────────────────────────────────────────
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  nombre          text        not null check (char_length(nombre) between 2 and 120),
  subtitulo       text        check (char_length(subtitulo) <= 120),        -- DJ o subtítulo
  fecha_inicio    timestamptz not null,
  lugar           text        not null check (char_length(lugar) between 2 and 120),
  direccion       text        check (char_length(direccion) <= 200),
  ciudad          text        not null default 'Oncativo, Córdoba' check (char_length(ciudad) <= 120),
  descripcion     text        check (char_length(descripcion) <= 2000),
  flyer_path      text,                                                      -- Storage público
  publicado       boolean     not null default false,                        -- es el evento de la página de venta
  ventas_abiertas boolean     not null default false,
  acceso          text        not null default 'publico' check (acceso in ('publico', 'lista', 'clave')),
  clave_acceso    text        check (char_length(btrim(clave_acceso)) between 4 and 40), -- palabra clave
  mostrar_rrpp    boolean     not null default true,                         -- «¿Quién te vendió?» en la página
  creado_por      uuid        references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_por uuid        references auth.users(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);

alter table public.events add constraint events_clave_si_hace_falta
  check (acceso <> 'clave' or clave_acceso is not null);

-- Solo un evento en la página a la vez.
create unique index events_un_publicado on public.events (publicado) where publicado;

create trigger events_actualizado_en
  before update on public.events
  for each row execute function public.set_actualizado_en();

-- ─────────────────────────────────────────────────────────────
-- Tipos de entrada (libres por evento)
-- Lo vendido no se guarda acá: se calcula desde los pedidos (ver 0005).
-- Un tipo con ventas no se puede borrar (order_items lo referencia): se pasa a en_venta = false.
-- ─────────────────────────────────────────────────────────────
create table public.ticket_types (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid        not null references public.events(id) on delete cascade,
  nombre         text        not null check (char_length(nombre) between 1 and 60),
  descripcion    text        check (char_length(descripcion) <= 200),
  precio         integer     not null check (precio >= 0),                  -- pesos, sin decimales
  cupo_total     integer     not null check (cupo_total >= 0),
  comision_rrpp  integer     not null default 0 check (comision_rrpp >= 0), -- pesos fijos por entrada
  max_por_compra integer     not null default 10 check (max_por_compra between 1 and 50),
  en_venta       boolean     not null default true,
  orden          integer     not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index ticket_types_event on public.ticket_types (event_id, orden);

create trigger ticket_types_actualizado_en
  before update on public.ticket_types
  for each row execute function public.set_actualizado_en();

-- ═════════════ 0002_rrpp.sql ═════════════
-- Nevada Producciones
-- 0002: usuarios (admin y RRPP), pedidos de acceso y vendedores.
-- Las contraseñas las maneja Supabase Auth (auth.users); acá nunca se guardan.

-- ─────────────────────────────────────────────────────────────
-- Perfiles: uno por usuario de Supabase Auth.
-- Nadie se asigna un rol solo: el perfil lo crea el servidor y el rol lo cambia el admin.
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text        not null check (char_length(nombre) between 2 and 80),
  usuario   text        not null unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  rol       text        not null check (rol in ('admin', 'rrpp')),
  activo    boolean     not null default false,   -- un RRPP nuevo arranca inactivo hasta que lo aprueban
  creado_en timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Pedidos de acceso de RRPP (desde /ingresar). Quedan pendientes hasta que el admin decide.
-- ─────────────────────────────────────────────────────────────
create table public.access_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid        not null unique references public.profiles(id) on delete cascade,
  whatsapp     text        check (whatsapp ~ '^[0-9+\s()-]{8,20}$'),
  estado       text        not null default 'pendiente'
                           check (estado in ('pendiente', 'aprobada', 'rechazada')),
  revisado_por uuid        references public.profiles(id) on delete set null,
  revisado_en  timestamptz,
  creado_en    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Vendedores (RRPP). Aparecen en «¿Quién te vendió?» y tienen su link /?rrpp=codigo.
-- profile_id puede quedar vacío para un RRPP cargado por el admin sin usuario propio.
-- ─────────────────────────────────────────────────────────────
create table public.sellers (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid        unique references public.profiles(id) on delete set null,
  nombre_publico      text        not null check (char_length(nombre_publico) between 2 and 80),
  codigo              text        not null unique check (codigo ~ '^[a-z0-9-]{2,30}$'),
  puede_cargar_ventas boolean     not null default true,
  max_invitados       integer     check (max_invitados >= 0),   -- tope de invitados por evento; vacío = sin tope
  activo              boolean     not null default true,
  creado_en           timestamptz not null default now()
);

-- ═════════════ 0003_pedidos_y_pagos.sql ═════════════
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

-- ═════════════ 0004_seguridad.sql ═════════════
-- Nevada Producciones
-- 0004: seguridad a nivel de fila (RLS).
--
-- Tercera barrera (ver docs/SEGURIDAD.md): aunque alguien saltee la interfaz y el servidor,
-- la base solo le devuelve lo que le corresponde.
--   anon (comprador)  no lee ninguna tabla directo: solo las vistas y funciones públicas de 0005.
--   rrpp              solo lo suyo: sus ventas, sus comisiones y sus rendiciones.
--   admin             todo.
-- Las escrituras sensibles (crear pedidos, aprobar, emitir, escanear) pasan por funciones del
-- servidor que vuelven a verificar todo; el navegador nunca escribe directo.

-- ─────────────────────────────────────────────────────────────
-- Quién es el usuario actual
-- security definer: leen profiles/sellers sin depender de sus propias políticas.
-- ─────────────────────────────────────────────────────────────

-- Admin con la doble verificación hecha en esta sesión (aal2): sin el código del celular, una
-- contraseña robada no alcanza para nada de admin.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.rol = 'admin' and p.activo
     );
$$;

create or replace function public.mi_seller_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.sellers s
  join public.profiles p on p.id = s.profile_id
  where p.id = auth.uid() and p.rol = 'rrpp' and p.activo and s.activo;
$$;

revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.mi_seller_id() from public, anon;
grant execute on function public.es_admin() to authenticated, service_role;
grant execute on function public.mi_seller_id() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- RLS activado en todas las tablas: sin política, nadie lee ni escribe.
-- (service_role, que solo usa el servidor, la saltea.)
-- ─────────────────────────────────────────────────────────────
alter table public.events             enable row level security;
alter table public.event_guests       enable row level security;
alter table public.ticket_types       enable row level security;
alter table public.profiles           enable row level security;
alter table public.access_requests    enable row level security;
alter table public.sellers            enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.order_attendees    enable row level security;
alter table public.payments           enable row level security;
alter table public.tickets            enable row level security;
alter table public.checkins           enable row level security;
alter table public.scan_attempts      enable row level security;
alter table public.commissions        enable row level security;
alter table public.commission_payouts enable row level security;
alter table public.payout_items       enable row level security;
alter table public.seller_settlements enable row level security;
alter table public.email_log          enable row level security;
alter table public.audit_log          enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Admin: lee todo; escribe en la configuración (eventos, tipos, RRPP, perfiles, accesos).
-- Pedidos, pagos, entradas, comisiones y rendiciones los escribe el servidor con sus funciones.
-- ─────────────────────────────────────────────────────────────
create policy "admin gestiona eventos" on public.events
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona tipos" on public.ticket_types
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona perfiles" on public.profiles
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona accesos" on public.access_requests
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona rrpp" on public.sellers
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona invitados" on public.event_guests
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "admin lee pedidos"      on public.orders             for select to authenticated using (public.es_admin());
create policy "admin lee items"        on public.order_items        for select to authenticated using (public.es_admin());
create policy "admin lee personas"     on public.order_attendees    for select to authenticated using (public.es_admin());
create policy "admin lee pagos"        on public.payments           for select to authenticated using (public.es_admin());
create policy "admin lee entradas"     on public.tickets            for select to authenticated using (public.es_admin());
create policy "admin lee ingresos"     on public.checkins           for select to authenticated using (public.es_admin());
create policy "admin lee escaneos"     on public.scan_attempts      for select to authenticated using (public.es_admin());
create policy "admin lee comisiones"   on public.commissions        for select to authenticated using (public.es_admin());
create policy "admin lee pagos rrpp"   on public.commission_payouts for select to authenticated using (public.es_admin());
create policy "admin lee pagos items"  on public.payout_items       for select to authenticated using (public.es_admin());
create policy "admin lee rendiciones"  on public.seller_settlements for select to authenticated using (public.es_admin());
create policy "admin lee mails"        on public.email_log          for select to authenticated using (public.es_admin());
create policy "admin lee auditoria"    on public.audit_log          for select to authenticated using (public.es_admin());

-- ─────────────────────────────────────────────────────────────
-- RRPP: solo lo suyo
-- ─────────────────────────────────────────────────────────────
create policy "cada uno ve su perfil" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "cada uno ve su pedido de acceso" on public.access_requests
  for select to authenticated using (profile_id = auth.uid());
create policy "rrpp ve su ficha" on public.sellers
  for select to authenticated using (id = public.mi_seller_id());

-- Eventos con ventas abiertas (para cargar ventas) y el evento con invitación que está en la página
-- (para armar su lista de invitados o ver la palabra clave que comparte), con sus tipos y comisión.
create policy "rrpp ve eventos en venta" on public.events
  for select to authenticated using (
    public.mi_seller_id() is not null and (ventas_abiertas or (publicado and acceso in ('lista', 'clave')))
  );
create policy "rrpp ve tipos en venta" on public.ticket_types
  for select to authenticated using (
    public.mi_seller_id() is not null
    and exists (select 1 from public.events e
                where e.id = event_id and (e.ventas_abiertas or (e.publicado and e.acceso in ('lista', 'clave'))))
  );

-- Su propia lista de invitados: la ve, agrega, edita y da de baja. Nunca la de otro RRPP.
create policy "rrpp ve sus invitados" on public.event_guests
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp agrega sus invitados" on public.event_guests
  for insert to authenticated
  with check (seller_id = public.mi_seller_id() and creado_por = auth.uid());
create policy "rrpp edita sus invitados" on public.event_guests
  for update to authenticated
  using (seller_id = public.mi_seller_id()) with check (seller_id = public.mi_seller_id());
create policy "rrpp borra sus invitados" on public.event_guests
  for delete to authenticated using (seller_id = public.mi_seller_id());

create policy "rrpp ve sus ventas" on public.orders
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp ve items de sus ventas" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.seller_id = public.mi_seller_id())
  );
-- Personas y QR: solo de las ventas que cargó él (no de las compras web que lo eligieron).
create policy "rrpp ve personas de lo que cargó" on public.order_attendees
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and o.origen = 'rrpp' and o.seller_id = public.mi_seller_id())
  );
create policy "rrpp ve entradas de lo que cargó" on public.tickets
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and o.origen = 'rrpp' and o.seller_id = public.mi_seller_id())
  );
create policy "rrpp ve sus comisiones" on public.commissions
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp ve sus cobros de comision" on public.commission_payouts
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp ve sus rendiciones" on public.seller_settlements
  for select to authenticated using (seller_id = public.mi_seller_id());

-- ─────────────────────────────────────────────────────────────
-- Permisos de tabla.
-- Supabase da por defecto todos los permisos a anon y authenticated (y deja a RLS decidir).
-- Acá se achican: el navegador nunca inserta, modifica ni borra pedidos, pagos ni entradas.
-- ─────────────────────────────────────────────────────────────
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on
  public.orders, public.order_items, public.order_attendees, public.payments,
  public.tickets, public.checkins, public.scan_attempts, public.commissions,
  public.commission_payouts, public.payout_items, public.seller_settlements,
  public.email_log, public.audit_log
  from authenticated;
revoke update, delete, truncate on public.audit_log from service_role;
revoke all on sequence public.order_numero_seq from anon, authenticated;

-- ═════════════ 0005_venta_publica.sql ═════════════
-- Nevada Producciones
-- 0005: lo que necesita la página de venta y el seguimiento del comprador.
--   • Vistas públicas: el evento en la página, sus tipos con lo disponible y los RRPP activos.
--   • crear_pedido_web(): crea el pedido de una compra web, con montos calculados acá.
--   • pedido_por_token(): estado del pedido para el link privado /pedido/[token].
--   • verificar_invitacion(): en un evento con lista, si el mail está y cuántas entradas le quedan.
--   • verificar_clave(): en un evento con palabra clave, si la palabra es correcta.
-- Las funciones solo las puede llamar el servidor (service_role), nunca el navegador.

-- ─────────────────────────────────────────────────────────────
-- Cupo ocupado de cada tipo: lo pagado, lo aprobado, lo que espera confirmación y las compras
-- web que todavía están dentro de su plazo para pagar. Lo vencido, rechazado o cancelado libera.
-- Corre con permisos del dueño (cuenta pedidos que nadie de afuera puede leer) y no tiene permisos
-- para anon ni authenticated: la usan solo las vistas públicas y las funciones de abajo.
-- ─────────────────────────────────────────────────────────────
create or replace view public.ticket_type_ocupacion as
select
  t.id as ticket_type_id,
  coalesce(sum(i.cantidad) filter (
    where o.status in ('pagado', 'por_confirmar', 'aprobado')
       or (o.status = 'pendiente_pago' and o.vence_en > now())
  ), 0)::integer as ocupadas
from public.ticket_types t
left join public.order_items i on i.ticket_type_id = t.id
left join public.orders o on o.id = i.order_id
group by t.id;

revoke all on public.ticket_type_ocupacion from anon, authenticated;

-- El cupo de un tipo no puede quedar por debajo de lo ya vendido o reservado.
create or replace function public.ticket_types_cupo_minimo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ocupadas integer;
begin
  select oc.ocupadas into v_ocupadas
  from public.ticket_type_ocupacion oc where oc.ticket_type_id = new.id;
  if new.cupo_total < coalesce(v_ocupadas, 0) then
    raise exception 'NEV:cupo_menor_que_vendido' using detail = v_ocupadas::text;
  end if;
  return new;
end;
$$;

create trigger ticket_types_cupo_minimo
  before update of cupo_total on public.ticket_types
  for each row when (new.cupo_total < old.cupo_total)
  execute function public.ticket_types_cupo_minimo();

-- ─────────────────────────────────────────────────────────────
-- Vistas públicas.
-- Sin security_invoker a propósito: corren con permisos del dueño para poder contar el cupo
-- sobre pedidos que el comprador no puede leer, y exponen solo columnas pensadas para el público
-- (ni comisiones, ni cupos totales, ni datos internos).
-- ─────────────────────────────────────────────────────────────
create or replace view public.storefront_event as
select e.id, e.nombre, e.subtitulo, e.fecha_inicio, e.lugar, e.direccion, e.ciudad,
       e.descripcion, e.flyer_path, e.ventas_abiertas, e.acceso, e.mostrar_rrpp
from public.events e
where e.publicado;

create or replace view public.storefront_ticket_types as
select
  t.id,
  t.event_id,
  t.nombre,
  t.descripcion,
  t.precio,
  greatest(t.cupo_total - oc.ocupadas, 0) as disponibles,
  t.max_por_compra,
  t.en_venta,
  t.orden
from public.ticket_types t
join public.events e on e.id = t.event_id and e.publicado
join public.ticket_type_ocupacion oc on oc.ticket_type_id = t.id;

create or replace view public.storefront_sellers as
select s.id, s.nombre_publico, s.codigo
from public.sellers s
where s.activo;

-- Solo lectura. Supabase da por defecto todos los permisos sobre objetos nuevos, y una vista
-- simple acepta UPDATE/INSERT/DELETE: con permisos del dueño eso saltearía RLS.
revoke all on public.storefront_event, public.storefront_ticket_types, public.storefront_sellers
  from anon, authenticated;
grant select on public.storefront_event, public.storefront_ticket_types, public.storefront_sellers
  to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Invitados
-- ─────────────────────────────────────────────────────────────

-- Entradas que ya usó cada invitado (mismos estados que ocupan cupo).
create or replace view public.event_guest_ocupacion as
select
  g.id as guest_id,
  coalesce(sum(i.cantidad) filter (
    where o.status in ('pagado', 'por_confirmar', 'aprobado')
       or (o.status = 'pendiente_pago' and o.vence_en > now())
  ), 0)::integer as usadas
from public.event_guests g
left join public.orders o on o.invitado_id = g.id
left join public.order_items i on i.order_id = o.id
group by g.id;

revoke all on public.event_guest_ocupacion from anon, authenticated;

-- Tope de invitados por RRPP y por evento (sellers.max_invitados).
create or replace function public.event_guests_tope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tope integer;
  v_cargados integer;
begin
  if new.seller_id is null or not new.activo then
    return new;
  end if;
  select s.max_invitados into v_tope from public.sellers s where s.id = new.seller_id;
  if v_tope is null then
    return new;
  end if;
  -- Bloquea al RRPP para que dos altas simultáneas no pasen el tope.
  perform 1 from public.sellers s where s.id = new.seller_id for update;
  select count(*) into v_cargados from public.event_guests g
  where g.seller_id = new.seller_id and g.event_id = new.event_id and g.activo and g.id <> new.id;
  if v_cargados >= v_tope then
    raise exception 'NEV:tope_invitados' using detail = v_tope::text;
  end if;
  return new;
end;
$$;

create trigger event_guests_tope
  before insert or update of activo, seller_id, event_id on public.event_guests
  for each row execute function public.event_guests_tope();

-- Intentos de verificación por IP (para que no se pueda adivinar la lista ni la clave probando).
create table public.invite_checks (
  id        bigint generated always as identity primary key,
  ip_hash   text        not null,
  creado_en timestamptz not null default now()
);
create index invite_checks_ip on public.invite_checks (ip_hash, creado_en);
alter table public.invite_checks enable row level security;
revoke all on public.invite_checks from anon, authenticated;

-- ¿Este mail está invitado? Devuelve nombre, máximo y lo que le queda, o null.
-- Hasta 10 consultas cada 10 minutos por IP.
create or replace function public.verificar_invitacion(p_event_id uuid, p_email text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ip_hash is not null then
    if (select count(*) from public.invite_checks c
        where c.ip_hash = p_ip_hash and c.creado_en > now() - interval '10 minutes') >= 10 then
      raise exception 'NEV:demasiados_intentos';
    end if;
    insert into public.invite_checks (ip_hash) values (p_ip_hash);
    delete from public.invite_checks c where c.creado_en < now() - interval '1 day';
  end if;

  return (
    select jsonb_build_object(
      'nombre', g.nombre,
      'max_entradas', g.max_entradas,
      'restantes', greatest(g.max_entradas - oc.usadas, 0)
    )
    from public.event_guests g
    join public.events e on e.id = g.event_id and e.publicado and e.acceso = 'lista'
    join public.event_guest_ocupacion oc on oc.guest_id = g.id
    where g.event_id = p_event_id and g.email = lower(btrim(p_email)) and g.activo
  );
end;
$$;

-- Compara la palabra clave sin importar mayúsculas, espacios de más ni acentos.
create or replace function public.clave_normalizada(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           translate(lower(btrim(p)), 'áéíóúüñ', 'aeiouun'),
           '\s+', ' ', 'g');
$$;

-- ¿Es la palabra clave del evento? Hasta 10 intentos cada 10 minutos por IP (comparte el límite
-- con la consulta de invitados).
create or replace function public.verificar_clave(p_event_id uuid, p_clave text, p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ip_hash is not null then
    if (select count(*) from public.invite_checks c
        where c.ip_hash = p_ip_hash and c.creado_en > now() - interval '10 minutes') >= 10 then
      raise exception 'NEV:demasiados_intentos';
    end if;
    insert into public.invite_checks (ip_hash) values (p_ip_hash);
  end if;

  return exists (
    select 1 from public.events e
    where e.id = p_event_id and e.publicado and e.acceso = 'clave'
      and public.clave_normalizada(e.clave_acceso) = public.clave_normalizada(p_clave)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Crear pedido web.
-- Controles: evento en la página y con ventas abiertas, tipos del evento y a la venta, cantidades
-- dentro del máximo, cupo (con los tipos bloqueados mientras se cuenta, así dos compras a la vez
-- no sobrevenden), RRPP activo, lista de invitados si el evento es con lista (la venta queda
-- para el RRPP que invitó), palabra clave si el evento es con clave, límite de pedidos por IP y por mail, y pedido único por
-- idempotency_key (un doble click o un reintento devuelven el mismo pedido).
-- Los errores salen con el prefijo NEV: y un código que el servidor traduce para el comprador.
-- ─────────────────────────────────────────────────────────────
create or replace function public.crear_pedido_web(
  p_event_id        uuid,
  p_items           jsonb,   -- [{"ticket_type_id": "...", "cantidad": 2}, ...]
  p_nombre          text,
  p_apellido        text,
  p_email           text,
  p_whatsapp        text,
  p_seller_id       uuid,
  p_idempotency_key uuid,
  p_token_hash      text,
  p_ip_hash         text,
  p_clave           text default null
)
returns table (order_id uuid, numero text, total integer, ya_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plazo    constant interval := interval '30 minutes';
  v_event     public.events%rowtype;
  v_guest     public.event_guests%rowtype;
  v_restantes integer;
  v_seller_id uuid := p_seller_id;
  v_tipo      public.ticket_types%rowtype;
  v_item      record;
  v_ocupadas  integer;
  v_total     integer := 0;
  v_unidades  integer := 0;
  v_order_id  uuid;
  v_numero    text;
  v_email     text := lower(btrim(p_email));
begin
  -- Reintento del mismo pedido: se devuelve el que ya existe.
  select o.id, o.numero, o.total into v_order_id, v_numero, v_total
  from public.orders o where o.idempotency_key = p_idempotency_key;
  if found then
    return query select v_order_id, v_numero, v_total, true;
    return;
  end if;
  v_total := 0;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'NEV:sin_entradas';
  end if;

  select * into v_event from public.events e where e.id = p_event_id for share;
  if not found or not v_event.publicado then
    raise exception 'NEV:evento_no_disponible';
  end if;
  if not v_event.ventas_abiertas then
    raise exception 'NEV:ventas_cerradas';
  end if;

  if p_seller_id is not null
     and not exists (select 1 from public.sellers s where s.id = p_seller_id and s.activo) then
    raise exception 'NEV:rrpp_no_disponible';
  end if;

  -- Evento con palabra clave: se vuelve a controlar acá (la página no alcanza).
  if v_event.acceso = 'clave'
     and public.clave_normalizada(v_event.clave_acceso) is distinct from public.clave_normalizada(p_clave) then
    raise exception 'NEV:clave_incorrecta';
  end if;

  -- Evento con lista: solo los invitados. Se bloquea al invitado para que dos compras a la vez
  -- no pasen su máximo.
  if v_event.acceso = 'lista' then
    select * into v_guest from public.event_guests g
    where g.event_id = p_event_id and g.email = v_email and g.activo
    for update;
    if not found then
      raise exception 'NEV:no_invitado';
    end if;
    select greatest(v_guest.max_entradas - oc.usadas, 0) into v_restantes
    from public.event_guest_ocupacion oc where oc.guest_id = v_guest.id;
    v_seller_id := coalesce(v_guest.seller_id, p_seller_id);
  end if;

  -- Límites anti abuso.
  if p_ip_hash is not null and (
       select count(*) from public.orders o
       where o.ip_hash = p_ip_hash and o.creado_en > now() - interval '10 minutes'
     ) >= 8 then
    raise exception 'NEV:demasiados_pedidos';
  end if;
  if (select count(*) from public.orders o
      where lower(o.comprador_email) = v_email
        and o.status = 'pendiente_pago' and o.vence_en > now()) >= 3 then
    raise exception 'NEV:demasiados_pendientes';
  end if;

  -- Libera reservas vencidas de este evento.
  update public.orders o set status = 'vencido'
  where o.event_id = p_event_id and o.status = 'pendiente_pago' and o.vence_en <= now();

  insert into public.orders (
    event_id, comprador_nombre, comprador_apellido, comprador_email, comprador_whatsapp,
    seller_id, invitado_id, origen, metodo_pago, total, status, vence_en, idempotency_key, token_hash, ip_hash
  ) values (
    p_event_id, btrim(p_nombre), btrim(p_apellido), v_email, nullif(btrim(p_whatsapp), ''),
    v_seller_id, v_guest.id, 'web', 'mercadopago', 0, 'pendiente_pago', now() + v_plazo,
    p_idempotency_key, p_token_hash, p_ip_hash
  )
  returning id, orders.numero into v_order_id, v_numero;

  -- Tipos en orden fijo (evita bloqueos cruzados entre compras simultáneas).
  for v_item in
    select (x->>'ticket_type_id')::uuid as ticket_type_id, sum((x->>'cantidad')::integer) as cantidad
    from jsonb_array_elements(p_items) x
    group by 1
    order by 1
  loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'NEV:cantidad_invalida';
    end if;

    select * into v_tipo from public.ticket_types t
    where t.id = v_item.ticket_type_id and t.event_id = p_event_id
    for update;
    if not found or not v_tipo.en_venta then
      raise exception 'NEV:tipo_no_disponible';
    end if;
    if v_item.cantidad > v_tipo.max_por_compra then
      raise exception 'NEV:cantidad_maxima' using detail = v_tipo.nombre;
    end if;

    select oc.ocupadas into v_ocupadas
    from public.ticket_type_ocupacion oc where oc.ticket_type_id = v_tipo.id;
    if v_ocupadas + v_item.cantidad > v_tipo.cupo_total then
      raise exception 'NEV:sin_cupo' using detail = v_tipo.nombre;
    end if;

    insert into public.order_items (order_id, ticket_type_id, cantidad, precio_unitario,
                                    comision_unitaria, subtotal)
    values (v_order_id, v_tipo.id, v_item.cantidad, v_tipo.precio,
            v_tipo.comision_rrpp, v_item.cantidad * v_tipo.precio);

    v_total := v_total + v_item.cantidad * v_tipo.precio;
    v_unidades := v_unidades + v_item.cantidad;
  end loop;

  if v_unidades > 20 then
    raise exception 'NEV:cantidad_maxima';
  end if;
  if v_guest.id is not null and v_unidades > v_restantes then
    raise exception 'NEV:supera_invitacion' using detail = v_restantes::text;
  end if;

  update public.orders o set total = v_total where o.id = v_order_id;

  return query select v_order_id, v_numero, v_total, false;

exception
  -- Dos envíos del mismo pedido a la vez: el segundo devuelve el primero.
  when unique_violation then
    select o.id, o.numero, o.total into v_order_id, v_numero, v_total
    from public.orders o where o.idempotency_key = p_idempotency_key;
    if not found then
      raise;
    end if;
    return query select v_order_id, v_numero, v_total, true;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Estado del pedido para su link privado. Recibe el SHA-256 del token (el token nunca llega a la
-- base) y devuelve solo lo que el comprador necesita ver.
-- ─────────────────────────────────────────────────────────────
create or replace function public.pedido_por_token(p_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero', o.numero,
    'status', case when o.status = 'pendiente_pago' and o.vence_en <= now()
                   then 'vencido' else o.status end,
    'total', o.total,
    'comprador_nombre', o.comprador_nombre,
    'comprador_email', o.comprador_email,
    'creado_en', o.creado_en,
    'vence_en', o.vence_en,
    'evento', jsonb_build_object(
      'nombre', e.nombre, 'subtitulo', e.subtitulo, 'fecha_inicio', e.fecha_inicio,
      'lugar', e.lugar, 'ciudad', e.ciudad
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', t.nombre, 'cantidad', i.cantidad,
               'precio_unitario', i.precio_unitario, 'subtotal', i.subtotal
             ) order by t.orden, t.nombre)
      from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id
      where i.order_id = o.id
    ), '[]'::jsonb),
    'entradas_emitidas', (select count(*) from public.tickets k
                          where k.order_id = o.id and k.status <> 'anulada'),
    -- Las entradas del pedido (para mostrar los QR en el link privado una vez aprobado).
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'titular', k.titular_nombre, 'tipo', t.nombre, 'qr_token', k.qr_token, 'status', k.status
             ) order by t.orden, k.titular_nombre)
      from public.tickets k join public.ticket_types t on t.id = k.ticket_type_id
      where k.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.events e on e.id = o.event_id
  where o.token_hash = p_token_hash;
$$;

revoke execute on function public.crear_pedido_web(uuid, jsonb, text, text, text, text, uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.pedido_por_token(text) from public, anon, authenticated;
revoke execute on function public.verificar_invitacion(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verificar_invitacion(uuid, text, text) to service_role;
revoke execute on function public.verificar_clave(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verificar_clave(uuid, text, text) to service_role;
grant execute on function public.crear_pedido_web(uuid, jsonb, text, text, text, text, uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.pedido_por_token(text) to service_role;

-- ═════════════ 0006_datos_iniciales.sql ═════════════
-- Nevada Producciones
-- 0006: primer evento, en la página y con las ventas CERRADAS.
-- Precios, cupos y comisiones son valores iniciales: se cambian desde el panel admin (etapa 4)
-- o, mientras tanto, desde el SQL Editor de Supabase.

with ev as (
  insert into public.events (nombre, subtitulo, fecha_inicio, lugar, ciudad, publicado, ventas_abiertas)
  select 'Navidad con Nevada 2026', 'DJ Nacho Heisecke', '2026-12-24 23:59:00-03',
         'Lugar a confirmar', 'Oncativo, Córdoba', true, false
  where not exists (select 1 from public.events)
  returning id
)
insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, comision_rrpp, orden)
select ev.id, v.nombre, v.descripcion, v.precio, v.cupo, 0, v.orden
from ev
cross join (values
  ('Entrada General', 'Acceso general al evento',  15000, 400, 1),
  ('Entrada +25',     'Acceso para mayores de 25', 20000, 200, 2)
) as v(nombre, descripcion, precio, cupo, orden);

-- ═════════════ 0007_rrpp_ventas.sql ═════════════
-- Nevada Producciones
-- 0007: lo que usan el ingreso y el panel del RRPP (etapa 3).
--   • email_de_usuario(): para entrar con usuario en vez de mail (solo servidor).
--   • emitir_entradas(): crea una entrada con QR por persona y la comisión del RRPP (interna).
--   • cargar_venta_rrpp(): el RRPP carga una venta con una persona por entrada.
--   • panel_rrpp(): números del panel del RRPP que llama.

-- ─────────────────────────────────────────────────────────────
-- Mail de un usuario, para el ingreso con usuario. Solo el servidor la puede llamar.
-- ─────────────────────────────────────────────────────────────
create or replace function public.email_de_usuario(p_usuario text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.usuario = lower(btrim(p_usuario));
$$;

revoke execute on function public.email_de_usuario(text) from public, anon, authenticated;
grant execute on function public.email_de_usuario(text) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Emitir entradas de un pedido aprobado.
-- Una entrada por persona cargada (ventas de RRPP) o, si no hay personas, una por unidad a nombre
-- del comprador (compras web). Nunca emite dos veces: bloquea el pedido y sale si ya tiene entradas.
-- El QR lleva qr_token más una firma HMAC que agrega el servidor (no se puede fabricar uno válido).
-- ─────────────────────────────────────────────────────────────
create or replace function public.emitir_entradas(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_emitidas integer;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'aprobado' then
    raise exception 'NEV:pedido_no_aprobado';
  end if;
  if exists (select 1 from public.tickets t where t.order_id = p_order_id) then
    return 0;
  end if;

  -- 2 UUID v4 sin guiones: 244 bits aleatorios.
  if exists (select 1 from public.order_attendees a where a.order_id = p_order_id) then
    insert into public.tickets (order_id, order_item_id, ticket_type_id, qr_token, titular_nombre, titular_email)
    select a.order_id, a.order_item_id, i.ticket_type_id,
           replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           a.nombre, a.email
    from public.order_attendees a
    join public.order_items i on i.id = a.order_item_id
    where a.order_id = p_order_id;
  else
    insert into public.tickets (order_id, order_item_id, ticket_type_id, qr_token, titular_nombre, titular_email)
    select i.order_id, i.id, i.ticket_type_id,
           replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           v_order.comprador_nombre || ' ' || v_order.comprador_apellido, v_order.comprador_email
    from public.order_items i
    cross join lateral generate_series(1, i.cantidad)
    where i.order_id = p_order_id;
  end if;
  get diagnostics v_emitidas = row_count;

  -- Comisión del RRPP: monto fijo por entrada, congelado en el pedido.
  if v_order.seller_id is not null then
    insert into public.commissions (order_id, seller_id, monto)
    select p_order_id, v_order.seller_id, coalesce(sum(i.cantidad * i.comision_unitaria), 0)
    from public.order_items i where i.order_id = p_order_id
    on conflict (order_id) do nothing;
  end if;

  return v_emitidas;
end;
$$;

revoke execute on function public.emitir_entradas(uuid) from public, anon, authenticated;
grant execute on function public.emitir_entradas(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Venta cargada por el RRPP.
-- p_personas: [{"ticket_type_id": "...", "nombre": "Nombre Apellido", "email": "..."}], una por
-- entrada. El mail de la persona 1 es obligatorio; si otra no tiene, usa el de la persona 1.
-- Medio de pago:
--   efectivo_rrpp         entradas al instante, sin aprobación; el RRPP rinde el total
--   transferencia_rrpp    queda por confirmar (el admin lo confirma con el RRPP); rinde el total
--   transferencia_nevada  queda por confirmar (el admin ve el ingreso); no rinde
-- El RRPP sale de la sesión (auth.uid()), nunca de lo que manda el navegador.
-- ─────────────────────────────────────────────────────────────
create or replace function public.cargar_venta_rrpp(
  p_event_id        uuid,
  p_personas        jsonb,
  p_metodo          text,
  p_whatsapp        text,
  p_idempotency_key uuid,
  p_token_hash      text
)
returns table (order_id uuid, numero text, total integer, status text, ya_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seller    public.sellers%rowtype;
  v_event     public.events%rowtype;
  v_tipo      public.ticket_types%rowtype;
  v_item      record;
  v_ocupadas  integer;
  v_total     integer;
  v_order_id  uuid;
  v_numero    text;
  v_status    text;
  v_item_id   uuid;
  v_email1    text;
  v_nombre1   text;
  v_n         integer;
begin
  select s.* into v_seller from public.sellers s where s.id = public.mi_seller_id();
  if not found then
    raise exception 'NEV:sin_permiso';
  end if;
  if not v_seller.puede_cargar_ventas then
    raise exception 'NEV:no_carga_ventas';
  end if;

  -- Reintento: devuelve la venta ya cargada (solo si es de este mismo RRPP).
  select o.id, o.numero, o.total, o.status into v_order_id, v_numero, v_total, v_status
  from public.orders o where o.idempotency_key = p_idempotency_key and o.seller_id = v_seller.id;
  if found then
    return query select v_order_id, v_numero, v_total, v_status, true;
    return;
  end if;
  v_total := 0;

  if p_metodo not in ('efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada') then
    raise exception 'NEV:metodo_invalido';
  end if;
  if p_personas is null or jsonb_typeof(p_personas) <> 'array' then
    raise exception 'NEV:sin_entradas';
  end if;
  v_n := jsonb_array_length(p_personas);
  if v_n = 0 then
    raise exception 'NEV:sin_entradas';
  end if;
  if v_n > 20 then
    raise exception 'NEV:cantidad_maxima';
  end if;

  select * into v_event from public.events e where e.id = p_event_id for share;
  if not found then
    raise exception 'NEV:evento_no_disponible';
  end if;
  if not v_event.ventas_abiertas then
    raise exception 'NEV:ventas_cerradas';
  end if;

  v_nombre1 := btrim(p_personas -> 0 ->> 'nombre');
  v_email1 := lower(btrim(p_personas -> 0 ->> 'email'));
  if v_nombre1 is null or v_nombre1 !~ '\S+\s+\S+' then
    raise exception 'NEV:persona_sin_nombre' using detail = '1';
  end if;
  if v_email1 is null or v_email1 = '' then
    raise exception 'NEV:persona_sin_email';
  end if;
  for v_n in 1 .. jsonb_array_length(p_personas) loop
    if coalesce(btrim(p_personas -> (v_n - 1) ->> 'nombre'), '') !~ '\S+\s+\S+' then
      raise exception 'NEV:persona_sin_nombre' using detail = v_n::text;
    end if;
  end loop;

  -- El comprador del pedido es la persona 1: nombre y apellido de al menos 2 letras.
  if char_length(split_part(v_nombre1, ' ', 1)) < 2
     or char_length(btrim(substr(v_nombre1, length(split_part(v_nombre1, ' ', 1)) + 1))) < 2 then
    raise exception 'NEV:persona_sin_nombre' using detail = '1';
  end if;

  v_status := case when p_metodo = 'efectivo_rrpp' then 'aprobado' else 'por_confirmar' end;

  insert into public.orders (
    event_id, comprador_nombre, comprador_apellido, comprador_email, comprador_whatsapp,
    seller_id, origen, metodo_pago, total, status, idempotency_key, token_hash, creado_por
  ) values (
    p_event_id,
    split_part(v_nombre1, ' ', 1),
    btrim(substr(v_nombre1, length(split_part(v_nombre1, ' ', 1)) + 1)),
    v_email1, nullif(btrim(p_whatsapp), ''),
    v_seller.id, 'rrpp', p_metodo, 0, v_status, p_idempotency_key, p_token_hash, auth.uid()
  )
  returning id, orders.numero into v_order_id, v_numero;

  -- Tipos en orden fijo (evita bloqueos cruzados), con el cupo bloqueado mientras se cuenta.
  for v_item in
    select (x ->> 'ticket_type_id')::uuid as ticket_type_id, count(*)::integer as cantidad
    from jsonb_array_elements(p_personas) x
    group by 1
    order by 1
  loop
    select * into v_tipo from public.ticket_types t
    where t.id = v_item.ticket_type_id and t.event_id = p_event_id
    for update;
    if not found or not v_tipo.en_venta then
      raise exception 'NEV:tipo_no_disponible';
    end if;
    if v_item.cantidad > v_tipo.max_por_compra then
      raise exception 'NEV:cantidad_maxima' using detail = v_tipo.nombre;
    end if;
    select oc.ocupadas into v_ocupadas
    from public.ticket_type_ocupacion oc where oc.ticket_type_id = v_tipo.id;
    if v_ocupadas + v_item.cantidad > v_tipo.cupo_total then
      raise exception 'NEV:sin_cupo' using detail = v_tipo.nombre;
    end if;

    insert into public.order_items (order_id, ticket_type_id, cantidad, precio_unitario,
                                    comision_unitaria, subtotal)
    values (v_order_id, v_tipo.id, v_item.cantidad, v_tipo.precio,
            v_tipo.comision_rrpp, v_item.cantidad * v_tipo.precio)
    returning id into v_item_id;

    insert into public.order_attendees (order_id, order_item_id, nombre, email)
    select v_order_id, v_item_id, btrim(x ->> 'nombre'),
           coalesce(nullif(lower(btrim(x ->> 'email')), ''), v_email1)
    from jsonb_array_elements(p_personas) x
    where (x ->> 'ticket_type_id')::uuid = v_tipo.id;

    v_total := v_total + v_item.cantidad * v_tipo.precio;
  end loop;

  update public.orders o set total = v_total where o.id = v_order_id;

  insert into public.payments (order_id, medio, monto, status)
  values (v_order_id, p_metodo, v_total,
          case when p_metodo = 'efectivo_rrpp' then 'acreditado' else 'pendiente' end);

  if v_status = 'aprobado' then
    perform public.emitir_entradas(v_order_id);
  end if;

  insert into public.audit_log (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'venta_rrpp_cargada', 'orders', v_order_id::text,
          jsonb_build_object('numero', v_numero, 'total', v_total, 'metodo', p_metodo,
                             'entradas', jsonb_array_length(p_personas)));

  return query select v_order_id, v_numero, v_total, v_status, false;

exception
  when unique_violation then
    select o.id, o.numero, o.total, o.status into v_order_id, v_numero, v_total, v_status
    from public.orders o where o.idempotency_key = p_idempotency_key and o.seller_id = v_seller.id;
    if not found then
      raise;
    end if;
    return query select v_order_id, v_numero, v_total, v_status, true;
end;
$$;

revoke execute on function public.cargar_venta_rrpp(uuid, jsonb, text, text, uuid, text) from public, anon;
grant execute on function public.cargar_venta_rrpp(uuid, jsonb, text, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Panel del RRPP que llama (todos los eventos).
--   vendidas / vendido        pedidos aprobados a su nombre (cargados por él o web que lo eligieron)
--   comisión                  generada (pedidos aprobados), cobrada (pagos registrados), pendiente
--   a rendir                  lo cobrado a su nombre (efectivo y transferencias a él) menos lo rendido
-- ─────────────────────────────────────────────────────────────
create or replace function public.panel_rrpp()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select s.* from public.sellers s where s.id = public.mi_seller_id()
  ),
  aprob as (
    select o.* from public.orders o, s where o.seller_id = s.id and o.status = 'aprobado'
  ),
  rendido as (
    select coalesce(sum(r.monto_efectivo), 0) as efectivo,
           coalesce(sum(r.monto_transferencia), 0) as transferencia
    from public.seller_settlements r, s where r.seller_id = s.id
  )
  select jsonb_build_object(
    'nombre', s.nombre_publico,
    'codigo', s.codigo,
    'puede_cargar_ventas', s.puede_cargar_ventas,
    'max_invitados', s.max_invitados,
    'entradas', (select coalesce(sum(i.cantidad), 0) from public.order_items i
                 where i.order_id in (select id from aprob)),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'cantidad', x.cantidad)
                                           order by x.cantidad desc)
                          from (select t.nombre, sum(i.cantidad)::integer as cantidad
                                from public.order_items i
                                join public.ticket_types t on t.id = i.ticket_type_id
                                where i.order_id in (select id from aprob)
                                group by t.nombre) x), '[]'::jsonb),
    'vendido', (select coalesce(sum(total), 0) from aprob),
    'comision_generada', (select coalesce(sum(c.monto), 0) from public.commissions c
                          where c.seller_id = s.id and c.status <> 'anulada'),
    'comision_cobrada', (select coalesce(sum(p.monto), 0) from public.commission_payouts p
                         where p.seller_id = s.id),
    'cobrado_efectivo', (select coalesce(sum(total), 0) from aprob where metodo_pago = 'efectivo_rrpp'),
    'cobrado_transferencia', (select coalesce(sum(total), 0) from aprob where metodo_pago = 'transferencia_rrpp'),
    'rendido_efectivo', rendido.efectivo,
    'rendido_transferencia', rendido.transferencia,
    'por_aprobar', (select count(*) from public.orders o
                    where o.seller_id = s.id and o.status in ('pagado', 'por_confirmar'))
  )
  from s, rendido;
$$;

revoke execute on function public.panel_rrpp() from public, anon;
grant execute on function public.panel_rrpp() to authenticated;

-- ═════════════ 0008_admin.sql ═════════════
-- Nevada Producciones
-- 0008: panel del admin (etapa 4).
--
-- Todo cambio del admin pasa por estas funciones: cada una verifica que quien llama sea admin,
-- aplica las reglas del negocio y deja el cambio en la auditoría (quién, cuándo, antes y después).
-- Por eso el navegador ya no escribe directo en eventos, tipos, RRPP, perfiles ni accesos.
-- Los errores salen con el prefijo NEV: y un código que el servidor traduce.

-- ─────────────────────────────────────────────────────────────
-- Ayudantes internos
-- ─────────────────────────────────────────────────────────────
create or replace function public.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'NEV:sin_permiso';
  end if;
end;
$$;

create or replace function public.auditar(p_accion text, p_entidad text, p_id text, p_antes jsonb, p_despues jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), p_accion, p_entidad, p_id, p_antes, p_despues);
$$;

revoke execute on function public.exigir_admin() from public, anon;
revoke execute on function public.auditar(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- El navegador ya no escribe directo: solo con las funciones de abajo.
revoke insert, update, delete, truncate on
  public.events, public.ticket_types, public.sellers, public.profiles, public.access_requests
  from authenticated;

-- ─────────────────────────────────────────────────────────────
-- Eventos
-- ─────────────────────────────────────────────────────────────

-- Crea un evento como borrador (fuera de la página, ventas cerradas) con General y +25.
create or replace function public.admin_crear_evento(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_admin();
  insert into public.events (nombre, subtitulo, fecha_inicio, lugar, direccion, ciudad, descripcion,
                             creado_por, actualizado_por)
  values (btrim(p ->> 'nombre'), nullif(btrim(p ->> 'subtitulo'), ''), (p ->> 'fecha_inicio')::timestamptz,
          btrim(p ->> 'lugar'), nullif(btrim(p ->> 'direccion'), ''),
          coalesce(nullif(btrim(p ->> 'ciudad'), ''), 'Oncativo, Córdoba'),
          nullif(btrim(p ->> 'descripcion'), ''), auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, orden) values
    (v_id, 'Entrada General', 'Acceso general al evento', 15000, 400, 1),
    (v_id, 'Entrada +25', 'Acceso para mayores de 25', 20000, 200, 2);

  perform public.auditar('evento_creado', 'events', v_id::text, null,
                         (select to_jsonb(e) from public.events e where e.id = v_id));
  return v_id;
end;
$$;

-- Edita los datos del evento. Solo cambia las claves que vienen en p.
create or replace function public.admin_editar_evento(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(e) into v_antes from public.events e where e.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;

  update public.events e set
    nombre       = case when p ? 'nombre' then btrim(p ->> 'nombre') else e.nombre end,
    subtitulo    = case when p ? 'subtitulo' then nullif(btrim(p ->> 'subtitulo'), '') else e.subtitulo end,
    fecha_inicio = case when p ? 'fecha_inicio' then (p ->> 'fecha_inicio')::timestamptz else e.fecha_inicio end,
    lugar        = case when p ? 'lugar' then btrim(p ->> 'lugar') else e.lugar end,
    direccion    = case when p ? 'direccion' then nullif(btrim(p ->> 'direccion'), '') else e.direccion end,
    ciudad       = case when p ? 'ciudad' then btrim(p ->> 'ciudad') else e.ciudad end,
    descripcion  = case when p ? 'descripcion' then nullif(btrim(p ->> 'descripcion'), '') else e.descripcion end,
    acceso       = case when p ? 'acceso' then p ->> 'acceso' else e.acceso end,
    clave_acceso = case when p ? 'clave_acceso' then nullif(btrim(p ->> 'clave_acceso'), '') else e.clave_acceso end,
    mostrar_rrpp = case when p ? 'mostrar_rrpp' then (p ->> 'mostrar_rrpp')::boolean else e.mostrar_rrpp end,
    actualizado_por = auth.uid()
  where e.id = p_id;

  perform public.auditar('evento_editado', 'events', p_id::text, v_antes,
                         (select to_jsonb(e) from public.events e where e.id = p_id));
end;
$$;

-- Pone o saca el evento de la página (poner uno saca al anterior) y abre o cierra sus ventas.
create or replace function public.admin_estado_evento(p_id uuid, p_publicado boolean, p_ventas_abiertas boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(e) into v_antes from public.events e where e.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;

  if p_publicado then
    update public.events e set publicado = false, actualizado_por = auth.uid()
    where e.publicado and e.id <> p_id;
  end if;
  update public.events e set
    publicado = coalesce(p_publicado, e.publicado),
    ventas_abiertas = coalesce(p_ventas_abiertas, e.ventas_abiertas),
    actualizado_por = auth.uid()
  where e.id = p_id;

  perform public.auditar('evento_estado', 'events', p_id::text,
                         jsonb_build_object('publicado', v_antes -> 'publicado', 'ventas_abiertas', v_antes -> 'ventas_abiertas'),
                         (select jsonb_build_object('publicado', e.publicado, 'ventas_abiertas', e.ventas_abiertas)
                          from public.events e where e.id = p_id));
end;
$$;

-- Copia un evento con sus tipos, como borrador.
create or replace function public.admin_duplicar_evento(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_admin();
  insert into public.events (nombre, subtitulo, fecha_inicio, lugar, direccion, ciudad, descripcion, flyer_path,
                             acceso, clave_acceso, mostrar_rrpp, creado_por, actualizado_por)
  select left(e.nombre, 110) || ' (copia)', e.subtitulo, e.fecha_inicio, e.lugar, e.direccion, e.ciudad,
         e.descripcion, e.flyer_path, e.acceso, e.clave_acceso, e.mostrar_rrpp, auth.uid(), auth.uid()
  from public.events e where e.id = p_id
  returning id into v_id;
  if v_id is null then
    raise exception 'NEV:no_existe';
  end if;

  insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, comision_rrpp,
                                   max_por_compra, en_venta, orden)
  select v_id, t.nombre, t.descripcion, t.precio, t.cupo_total, t.comision_rrpp, t.max_por_compra, t.en_venta, t.orden
  from public.ticket_types t where t.event_id = p_id;

  perform public.auditar('evento_duplicado', 'events', v_id::text, jsonb_build_object('origen', p_id), null);
  return v_id;
end;
$$;

-- Elimina un evento solo si no tiene ventas.
create or replace function public.admin_eliminar_evento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(e) into v_antes from public.events e where e.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;
  if exists (select 1 from public.orders o where o.event_id = p_id) then
    raise exception 'NEV:evento_con_ventas';
  end if;
  delete from public.events e where e.id = p_id;
  perform public.auditar('evento_eliminado', 'events', p_id::text, v_antes, null);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Tipos de entrada
-- ─────────────────────────────────────────────────────────────

-- Crea (p_id null) o edita un tipo. El cupo no puede bajar de lo vendido (trigger de 0005).
create or replace function public.admin_guardar_tipo(p_id uuid, p_event_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_antes jsonb;
begin
  perform public.exigir_admin();
  if v_id is null then
    insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, comision_rrpp,
                                     max_por_compra, en_venta, orden)
    values (p_event_id, btrim(p ->> 'nombre'), nullif(btrim(p ->> 'descripcion'), ''),
            (p ->> 'precio')::integer, (p ->> 'cupo_total')::integer,
            coalesce((p ->> 'comision_rrpp')::integer, 0), coalesce((p ->> 'max_por_compra')::integer, 10),
            coalesce((p ->> 'en_venta')::boolean, true),
            coalesce((p ->> 'orden')::integer,
                     (select coalesce(max(t.orden), 0) + 1 from public.ticket_types t where t.event_id = p_event_id)))
    returning id into v_id;
  else
    select to_jsonb(t) into v_antes from public.ticket_types t where t.id = v_id for update;
    if v_antes is null then
      raise exception 'NEV:no_existe';
    end if;
    update public.ticket_types t set
      nombre         = case when p ? 'nombre' then btrim(p ->> 'nombre') else t.nombre end,
      descripcion    = case when p ? 'descripcion' then nullif(btrim(p ->> 'descripcion'), '') else t.descripcion end,
      precio         = case when p ? 'precio' then (p ->> 'precio')::integer else t.precio end,
      cupo_total     = case when p ? 'cupo_total' then (p ->> 'cupo_total')::integer else t.cupo_total end,
      comision_rrpp  = case when p ? 'comision_rrpp' then (p ->> 'comision_rrpp')::integer else t.comision_rrpp end,
      max_por_compra = case when p ? 'max_por_compra' then (p ->> 'max_por_compra')::integer else t.max_por_compra end,
      en_venta       = case when p ? 'en_venta' then (p ->> 'en_venta')::boolean else t.en_venta end,
      orden          = case when p ? 'orden' then (p ->> 'orden')::integer else t.orden end
    where t.id = v_id;
  end if;

  perform public.auditar(case when p_id is null then 'tipo_creado' else 'tipo_editado' end,
                         'ticket_types', v_id::text, v_antes,
                         (select to_jsonb(t) from public.ticket_types t where t.id = v_id));
  return v_id;
end;
$$;

-- Borra un tipo sin ventas. Si tiene ventas no se borra: se pasa a «no a la venta».
create or replace function public.admin_borrar_tipo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(t) into v_antes from public.ticket_types t where t.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;
  if exists (select 1 from public.order_items i where i.ticket_type_id = p_id) then
    update public.ticket_types t set en_venta = false where t.id = p_id;
    perform public.auditar('tipo_sin_venta', 'ticket_types', p_id::text, v_antes, null);
    return 'sin_venta';
  end if;
  delete from public.ticket_types t where t.id = p_id;
  perform public.auditar('tipo_borrado', 'ticket_types', p_id::text, v_antes, null);
  return 'borrado';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Pedidos y entradas
-- ─────────────────────────────────────────────────────────────

-- Aprueba un pedido pagado (Mercado Pago confirmado) o una transferencia por confirmar:
-- emite las entradas con QR y la comisión del RRPP. Devuelve cuántas entradas emitió.
create or replace function public.admin_aprobar_pedido(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_emitidas integer;
begin
  perform public.exigir_admin();
  select * into v_order from public.orders o where o.id = p_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_order.status not in ('pagado', 'por_confirmar') then
    raise exception 'NEV:estado_invalido' using detail = v_order.status;
  end if;

  update public.orders o set status = 'aprobado', revisado_por = auth.uid(), revisado_en = now()
  where o.id = p_id;
  -- La transferencia confirmada por el admin queda acreditada (Mercado Pago ya viene acreditado).
  update public.payments p set status = 'acreditado', revisado_por = auth.uid(), revisado_en = now()
  where p.order_id = p_id and p.status = 'pendiente';

  v_emitidas := public.emitir_entradas(p_id);
  perform public.auditar('pedido_aprobado', 'orders', p_id::text,
                         jsonb_build_object('status', v_order.status),
                         jsonb_build_object('status', 'aprobado', 'numero', v_order.numero, 'entradas', v_emitidas));
  return v_emitidas;
end;
$$;

-- Rechaza un pedido que esperaba aprobación: libera el cupo.
-- (Un pago de Mercado Pago rechazado se devuelve desde Mercado Pago; etapa 5.)
create or replace function public.admin_rechazar_pedido(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform public.exigir_admin();
  select * into v_order from public.orders o where o.id = p_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_order.status not in ('pagado', 'por_confirmar') then
    raise exception 'NEV:estado_invalido' using detail = v_order.status;
  end if;

  update public.orders o set status = 'rechazado', revisado_por = auth.uid(), revisado_en = now(),
                             motivo_rechazo = nullif(btrim(p_motivo), '')
  where o.id = p_id;
  update public.payments p set status = 'rechazado', revisado_por = auth.uid(), revisado_en = now(),
                               motivo_rechazo = nullif(btrim(p_motivo), '')
  where p.order_id = p_id and p.status in ('pendiente', 'iniciado');

  perform public.auditar('pedido_rechazado', 'orders', p_id::text,
                         jsonb_build_object('status', v_order.status),
                         jsonb_build_object('status', 'rechazado', 'numero', v_order.numero, 'motivo', p_motivo));
end;
$$;

-- Anula una entrada válida (deja de servir en la puerta).
create or replace function public.admin_anular_entrada(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform public.exigir_admin();
  select t.status into v_status from public.tickets t where t.id = p_id for update;
  if v_status is null then
    raise exception 'NEV:no_existe';
  end if;
  if v_status <> 'valida' then
    raise exception 'NEV:estado_invalido' using detail = v_status;
  end if;
  update public.tickets t set status = 'anulada', anulado_por = auth.uid(), anulado_en = now() where t.id = p_id;
  perform public.auditar('entrada_anulada', 'tickets', p_id::text, jsonb_build_object('status', v_status),
                         jsonb_build_object('status', 'anulada', 'motivo', p_motivo));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RRPP y accesos
-- ─────────────────────────────────────────────────────────────

-- Aprueba un pedido de acceso: activa el perfil y crea (o reactiva) su ficha de vendedor.
create or replace function public.admin_aprobar_acceso(p_request_id uuid, p_codigo text,
                                                       p_puede_cargar boolean, p_max_invitados integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.access_requests%rowtype;
  v_perfil public.profiles%rowtype;
  v_seller uuid;
begin
  perform public.exigir_admin();
  select * into v_req from public.access_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_req.estado <> 'pendiente' then
    raise exception 'NEV:estado_invalido' using detail = v_req.estado;
  end if;
  select * into v_perfil from public.profiles p where p.id = v_req.profile_id for update;

  update public.profiles p set activo = true where p.id = v_req.profile_id;
  update public.access_requests r set estado = 'aprobada', revisado_por = auth.uid(), revisado_en = now()
  where r.id = p_request_id;

  insert into public.sellers (profile_id, nombre_publico, codigo, puede_cargar_ventas, max_invitados, activo)
  values (v_req.profile_id, v_perfil.nombre, lower(btrim(p_codigo)), coalesce(p_puede_cargar, true),
          p_max_invitados, true)
  on conflict (profile_id) do update
    set activo = true, puede_cargar_ventas = excluded.puede_cargar_ventas, max_invitados = excluded.max_invitados
  returning id into v_seller;

  perform public.auditar('acceso_aprobado', 'access_requests', p_request_id::text, null,
                         jsonb_build_object('usuario', v_perfil.usuario, 'codigo', lower(btrim(p_codigo))));
  return v_seller;
end;
$$;

create or replace function public.admin_rechazar_acceso(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  update public.access_requests r set estado = 'rechazada', revisado_por = auth.uid(), revisado_en = now()
  where r.id = p_request_id and r.estado = 'pendiente';
  if not found then
    raise exception 'NEV:estado_invalido';
  end if;
  perform public.auditar('acceso_rechazado', 'access_requests', p_request_id::text, null, null);
end;
$$;

-- Edita un RRPP: activo (también su usuario), carga de ventas, tope de invitados, nombre y código.
-- Desactivarlo le corta el acceso al instante y lo saca de «¿Quién te vendió?».
create or replace function public.admin_editar_rrpp(p_seller_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_profile uuid;
begin
  perform public.exigir_admin();
  select to_jsonb(s), s.profile_id into v_antes, v_profile from public.sellers s where s.id = p_seller_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;

  update public.sellers s set
    activo              = case when p ? 'activo' then (p ->> 'activo')::boolean else s.activo end,
    puede_cargar_ventas = case when p ? 'puede_cargar_ventas' then (p ->> 'puede_cargar_ventas')::boolean
                               else s.puede_cargar_ventas end,
    max_invitados       = case when p ? 'max_invitados' then (p ->> 'max_invitados')::integer else s.max_invitados end,
    nombre_publico      = case when p ? 'nombre_publico' then btrim(p ->> 'nombre_publico') else s.nombre_publico end,
    codigo              = case when p ? 'codigo' then lower(btrim(p ->> 'codigo')) else s.codigo end
  where s.id = p_seller_id;

  if p ? 'activo' and v_profile is not null then
    update public.profiles pr set activo = (p ->> 'activo')::boolean where pr.id = v_profile and pr.rol = 'rrpp';
  end if;

  perform public.auditar('rrpp_editado', 'sellers', p_seller_id::text, v_antes,
                         (select to_jsonb(s) from public.sellers s where s.id = p_seller_id));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Plata con los RRPP
-- ─────────────────────────────────────────────────────────────

-- Saldos de todos los RRPP: comisiones y lo que tienen que rendir.
create or replace function public.admin_saldos_rrpp()
returns table (
  seller_id uuid, nombre text, codigo text, activo boolean, usuario text,
  entradas integer, vendido integer,
  comision_generada integer, comision_pagada integer,
  cobrado_efectivo integer, cobrado_transferencia integer,
  rendido_efectivo integer, rendido_transferencia integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
  select s.id, s.nombre_publico, s.codigo, s.activo, p.usuario,
    coalesce((select sum(i.cantidad) from public.order_items i join public.orders o on o.id = i.order_id
              where o.seller_id = s.id and o.status = 'aprobado'), 0)::integer,
    coalesce((select sum(o.total) from public.orders o where o.seller_id = s.id and o.status = 'aprobado'), 0)::integer,
    coalesce((select sum(c.monto) from public.commissions c where c.seller_id = s.id and c.status <> 'anulada'), 0)::integer,
    coalesce((select sum(x.monto) from public.commission_payouts x where x.seller_id = s.id), 0)::integer,
    coalesce((select sum(o.total) from public.orders o
              where o.seller_id = s.id and o.status = 'aprobado' and o.metodo_pago = 'efectivo_rrpp'), 0)::integer,
    coalesce((select sum(o.total) from public.orders o
              where o.seller_id = s.id and o.status = 'aprobado' and o.metodo_pago = 'transferencia_rrpp'), 0)::integer,
    coalesce((select sum(r.monto_efectivo) from public.seller_settlements r where r.seller_id = s.id), 0)::integer,
    coalesce((select sum(r.monto_transferencia) from public.seller_settlements r where r.seller_id = s.id), 0)::integer
  from public.sellers s
  left join public.profiles p on p.id = s.profile_id
  order by s.nombre_publico;
end;
$$;

-- Registra un pago de comisión (no puede pasar lo pendiente).
create or replace function public.admin_pagar_comision(p_seller_id uuid, p_monto integer, p_medio text, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendiente integer;
begin
  perform public.exigir_admin();
  perform 1 from public.sellers s where s.id = p_seller_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  select x.comision_generada - x.comision_pagada into v_pendiente
  from public.admin_saldos_rrpp() x where x.seller_id = p_seller_id;
  if p_monto is null or p_monto <= 0 then
    raise exception 'NEV:monto_invalido';
  end if;
  if p_monto > v_pendiente then
    raise exception 'NEV:supera_pendiente' using detail = v_pendiente::text;
  end if;
  insert into public.commission_payouts (seller_id, monto, medio, nota, registrado_por)
  values (p_seller_id, p_monto, p_medio, nullif(btrim(p_nota), ''), auth.uid());
  perform public.auditar('comision_pagada', 'sellers', p_seller_id::text, null,
                         jsonb_build_object('monto', p_monto, 'medio', p_medio));
end;
$$;

-- Registra lo que el RRPP rindió, por medio (no puede pasar lo que debe en cada uno).
create or replace function public.admin_registrar_rendicion(p_seller_id uuid, p_efectivo integer,
                                                            p_transferencia integer, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  perform public.exigir_admin();
  perform 1 from public.sellers s where s.id = p_seller_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  select * into v from public.admin_saldos_rrpp() x where x.seller_id = p_seller_id;
  if coalesce(p_efectivo, 0) < 0 or coalesce(p_transferencia, 0) < 0
     or coalesce(p_efectivo, 0) + coalesce(p_transferencia, 0) = 0 then
    raise exception 'NEV:monto_invalido';
  end if;
  if coalesce(p_efectivo, 0) > v.cobrado_efectivo - v.rendido_efectivo then
    raise exception 'NEV:supera_deuda' using detail = 'efectivo';
  end if;
  if coalesce(p_transferencia, 0) > v.cobrado_transferencia - v.rendido_transferencia then
    raise exception 'NEV:supera_deuda' using detail = 'transferencia';
  end if;
  insert into public.seller_settlements (seller_id, monto_efectivo, monto_transferencia, nota, registrado_por)
  values (p_seller_id, coalesce(p_efectivo, 0), coalesce(p_transferencia, 0), nullif(btrim(p_nota), ''), auth.uid());
  perform public.auditar('rendicion_registrada', 'sellers', p_seller_id::text, null,
                         jsonb_build_object('efectivo', p_efectivo, 'transferencia', p_transferencia));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Resumen de un evento
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_resumen_evento(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'tipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre, 'precio', t.precio, 'cupo', t.cupo_total, 'en_venta', t.en_venta,
        'vendidas', coalesce((select sum(i.cantidad) from public.order_items i join public.orders o on o.id = i.order_id
                              where i.ticket_type_id = t.id and o.status = 'aprobado'), 0),
        'ocupadas', oc.ocupadas) order by t.orden, t.nombre)
      from public.ticket_types t join public.ticket_type_ocupacion oc on oc.ticket_type_id = t.id
      where t.event_id = p_event_id), '[]'::jsonb),
    'recaudado', (select coalesce(sum(o.total), 0) from public.orders o
                  where o.event_id = p_event_id and o.status = 'aprobado'),
    'por_aprobar', (select count(*) from public.orders o
                    where o.event_id = p_event_id and o.status in ('pagado', 'por_confirmar')),
    'esperando_pago', (select count(*) from public.orders o
                       where o.event_id = p_event_id and o.status = 'pendiente_pago' and o.vence_en > now()),
    'ingresos', (select count(*) from public.checkins c join public.tickets k on k.id = c.ticket_id
                 join public.orders o on o.id = k.order_id where o.event_id = p_event_id),
    'ranking', coalesce((
      select jsonb_agg(x order by x.entradas desc, x.nombre)
      from (select s.nombre_publico as nombre, sum(i.cantidad)::integer as entradas, sum(i.subtotal)::integer as vendido
            from public.orders o join public.sellers s on s.id = o.seller_id
            join public.order_items i on i.order_id = o.id
            where o.event_id = p_event_id and o.status = 'aprobado'
            group by s.nombre_publico) x), '[]'::jsonb)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos: estas funciones las llama el admin con su sesión (y verifican que lo sea).
-- ─────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_crear_evento(jsonb)', 'admin_editar_evento(uuid, jsonb)',
    'admin_estado_evento(uuid, boolean, boolean)', 'admin_duplicar_evento(uuid)',
    'admin_eliminar_evento(uuid)', 'admin_guardar_tipo(uuid, uuid, jsonb)', 'admin_borrar_tipo(uuid)',
    'admin_aprobar_pedido(uuid)', 'admin_rechazar_pedido(uuid, text)', 'admin_anular_entrada(uuid, text)',
    'admin_aprobar_acceso(uuid, text, boolean, integer)', 'admin_rechazar_acceso(uuid)',
    'admin_editar_rrpp(uuid, jsonb)', 'admin_saldos_rrpp()', 'admin_pagar_comision(uuid, integer, text, text)',
    'admin_registrar_rendicion(uuid, integer, integer, text)', 'admin_resumen_evento(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ═════════════ 0009_puerta.sql ═════════════
-- Nevada Producciones
-- 0009: la Puerta (etapa 7).
--   • Código corto por entrada (8 caracteres) para tipearlo si el QR no se puede leer.
--   • puerta_escanear(): valida una entrada en la puerta de forma atómica.
--   • admin_puerta_resumen(): ingresos del evento.
-- Solo el admin (con doble verificación) puede usar la Puerta.

-- Código corto: los primeros 8 caracteres del token aleatorio, en mayúsculas (32 bits al azar).
alter table public.tickets
  add column codigo text generated always as (upper(left(qr_token, 8))) stored;
create unique index tickets_codigo on public.tickets (codigo);

-- ─────────────────────────────────────────────────────────────
-- Escanear una entrada.
-- p_token: el qr_token (el servidor ya verificó la firma del QR) o el código corto tipeado a mano.
-- Atómico: el UPDATE … WHERE status = 'valida' deja pasar a uno solo aunque dos celulares lean la
-- misma entrada al mismo tiempo; el otro recibe «usada» con la hora del primer ingreso.
-- Resultados: valida | usada | anulada | invalida (no existe o es de otro evento).
-- ─────────────────────────────────────────────────────────────
create or replace function public.puerta_escanear(p_event_id uuid, p_token text, p_dispositivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leido text := btrim(coalesce(p_token, ''));
  v_ticket public.tickets%rowtype;
  v_evento uuid;
  v_resultado text;
  v_tipo text;
  v_numero text;
begin
  perform public.exigir_admin();

  -- Intento de ingreso: la entrada válida de este evento pasa a usada, de una sola vez.
  update public.tickets t set status = 'usada', usada_en = now()
  from public.ticket_types tt
  where tt.id = t.ticket_type_id and tt.event_id = p_event_id and t.status = 'valida'
    and (t.qr_token = v_leido or t.codigo = upper(v_leido))
  returning t.* into v_ticket;

  if found then
    insert into public.checkins (ticket_id, escaneado_por, dispositivo)
    values (v_ticket.id, auth.uid(), left(p_dispositivo, 120));
    v_resultado := 'valida';
  else
    select t.* into v_ticket from public.tickets t
    where t.qr_token = v_leido or t.codigo = upper(v_leido)
    limit 1;
    if not found then
      v_resultado := 'invalida';
    else
      select tt.event_id into v_evento from public.ticket_types tt where tt.id = v_ticket.ticket_type_id;
      v_resultado := case
        when v_evento <> p_event_id then 'invalida'
        when v_ticket.status = 'anulada' then 'anulada'
        else 'usada'
      end;
    end if;
  end if;

  insert into public.scan_attempts (qr_token_leido, resultado, escaneado_por)
  values (left(v_leido, 200), v_resultado, auth.uid());

  if v_ticket.id is not null then
    select tt.nombre into v_tipo from public.ticket_types tt where tt.id = v_ticket.ticket_type_id;
    select o.numero into v_numero from public.orders o where o.id = v_ticket.order_id;
  end if;

  return jsonb_build_object(
    'resultado', v_resultado,
    'otro_evento', v_ticket.id is not null and v_resultado = 'invalida',
    'titular', case when v_resultado = 'invalida' then null else v_ticket.titular_nombre end,
    'tipo', case when v_resultado = 'invalida' then null else v_tipo end,
    'numero', case when v_resultado = 'invalida' then null else v_numero end,
    'usada_en', case when v_resultado = 'usada' then v_ticket.usada_en end,
    'ingresos', (select count(*) from public.checkins c join public.tickets k on k.id = c.ticket_id
                 join public.ticket_types tt on tt.id = k.ticket_type_id where tt.event_id = p_event_id)
  );
end;
$$;

-- Ingresos y entradas válidas que faltan entrar.
create or replace function public.admin_puerta_resumen(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'ingresos', (select count(*) from public.tickets k join public.ticket_types tt on tt.id = k.ticket_type_id
                 where tt.event_id = p_event_id and k.status = 'usada'),
    'faltan', (select count(*) from public.tickets k join public.ticket_types tt on tt.id = k.ticket_type_id
               where tt.event_id = p_event_id and k.status = 'valida')
  );
end;
$$;

revoke execute on function public.puerta_escanear(uuid, text, text) from public, anon;
revoke execute on function public.admin_puerta_resumen(uuid) from public, anon;
grant execute on function public.puerta_escanear(uuid, text, text) to authenticated;
grant execute on function public.admin_puerta_resumen(uuid) to authenticated;

-- ═════════════ 0010_portada.sql ═════════════
-- Portada de la página de venta: el admin elige entre las dos versiones del diseño.
--   a: camino hacia la montaña
--   c: contraluz azul

alter table public.events
  add column portada text not null default 'a'
  constraint events_portada_valida check (portada in ('a', 'c'));

-- La vista pública suma la portada (al final: create or replace view solo permite agregar columnas).
create or replace view public.storefront_event as
select e.id, e.nombre, e.subtitulo, e.fecha_inicio, e.lugar, e.direccion, e.ciudad,
       e.descripcion, e.flyer_path, e.ventas_abiertas, e.acceso, e.mostrar_rrpp, e.portada
from public.events e
where e.publicado;

create or replace function public.admin_editar_evento(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(e) into v_antes from public.events e where e.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;

  update public.events e set
    nombre       = case when p ? 'nombre' then btrim(p ->> 'nombre') else e.nombre end,
    subtitulo    = case when p ? 'subtitulo' then nullif(btrim(p ->> 'subtitulo'), '') else e.subtitulo end,
    fecha_inicio = case when p ? 'fecha_inicio' then (p ->> 'fecha_inicio')::timestamptz else e.fecha_inicio end,
    lugar        = case when p ? 'lugar' then btrim(p ->> 'lugar') else e.lugar end,
    direccion    = case when p ? 'direccion' then nullif(btrim(p ->> 'direccion'), '') else e.direccion end,
    ciudad       = case when p ? 'ciudad' then btrim(p ->> 'ciudad') else e.ciudad end,
    descripcion  = case when p ? 'descripcion' then nullif(btrim(p ->> 'descripcion'), '') else e.descripcion end,
    acceso       = case when p ? 'acceso' then p ->> 'acceso' else e.acceso end,
    clave_acceso = case when p ? 'clave_acceso' then nullif(btrim(p ->> 'clave_acceso'), '') else e.clave_acceso end,
    mostrar_rrpp = case when p ? 'mostrar_rrpp' then (p ->> 'mostrar_rrpp')::boolean else e.mostrar_rrpp end,
    portada      = case when p ? 'portada' then p ->> 'portada' else e.portada end,
    actualizado_por = auth.uid()
  where e.id = p_id;

  perform public.auditar('evento_editado', 'events', p_id::text, v_antes,
                         (select to_jsonb(e) from public.events e where e.id = p_id));
end;
$$;

create or replace function public.admin_duplicar_evento(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_admin();
  insert into public.events (nombre, subtitulo, fecha_inicio, lugar, direccion, ciudad, descripcion, flyer_path,
                             acceso, clave_acceso, mostrar_rrpp, portada, creado_por, actualizado_por)
  select left(e.nombre, 110) || ' (copia)', e.subtitulo, e.fecha_inicio, e.lugar, e.direccion, e.ciudad,
         e.descripcion, e.flyer_path, e.acceso, e.clave_acceso, e.mostrar_rrpp, e.portada, auth.uid(), auth.uid()
  from public.events e where e.id = p_id
  returning id into v_id;
  if v_id is null then
    raise exception 'NEV:no_existe';
  end if;

  insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, comision_rrpp,
                                   max_por_compra, en_venta, orden)
  select v_id, t.nombre, t.descripcion, t.precio, t.cupo_total, t.comision_rrpp, t.max_por_compra, t.en_venta, t.orden
  from public.ticket_types t where t.event_id = p_id;

  perform public.auditar('evento_duplicado', 'events', v_id::text, jsonb_build_object('origen', p_id), null);
  return v_id;
end;
$$;

-- ═════════════ 0011_pago_transferencia.sql ═════════════
-- Nevada Producciones
-- 0011: la compra web se paga con una transferencia común a la cuenta de Nevada (sin comisión).
-- El comprador transfiere, sube el comprobante y queda «por confirmar» hasta que el admin ve que la
-- plata entró y aprueba. Un comprobante (el mismo archivo) no sirve para dos pedidos.

-- ───────── Nuevo medio: transferencia web ─────────
do $$
declare
  c record;
begin
  -- Se reemplazan los controles que listaban los medios (no tienen nombre propio en 0003).
  for c in
    select conrelid::regclass::text as tabla, conname from pg_constraint
    where contype = 'c' and conrelid in ('public.orders'::regclass, 'public.payments'::regclass)
      and pg_get_constraintdef(oid) like '%mercadopago%'
  loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end;
$$;

alter table public.orders
  add constraint orders_metodo_pago_valido check (metodo_pago in
    ('mercadopago', 'transferencia_web', 'efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada')),
  -- La web paga con Mercado Pago o por transferencia a Nevada; las ventas de RRPP con sus medios.
  add constraint orders_metodo_segun_origen check
    ((origen = 'web') = (metodo_pago in ('mercadopago', 'transferencia_web')));

alter table public.payments
  add constraint payments_medio_valido check (medio in
    ('mercadopago', 'transferencia_web', 'efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada')),
  -- Huella del archivo del comprobante: el mismo archivo no se acepta en dos pedidos.
  add column comprobante_sha256 text unique check (comprobante_sha256 ~ '^[0-9a-f]{64}$'),
  add column comprobante_tipo   text check (comprobante_tipo in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'));

-- ───────── Compra web: ahora por transferencia y con 60 minutos para pagar ─────────
create or replace function public.crear_pedido_web(
  p_event_id        uuid,
  p_items           jsonb,   -- [{"ticket_type_id": "...", "cantidad": 2}, ...]
  p_nombre          text,
  p_apellido        text,
  p_email           text,
  p_whatsapp        text,
  p_seller_id       uuid,
  p_idempotency_key uuid,
  p_token_hash      text,
  p_ip_hash         text,
  p_clave           text default null
)
returns table (order_id uuid, numero text, total integer, ya_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plazo    constant interval := interval '60 minutes';
  v_event     public.events%rowtype;
  v_guest     public.event_guests%rowtype;
  v_restantes integer;
  v_seller_id uuid := p_seller_id;
  v_tipo      public.ticket_types%rowtype;
  v_item      record;
  v_ocupadas  integer;
  v_total     integer := 0;
  v_unidades  integer := 0;
  v_order_id  uuid;
  v_numero    text;
  v_email     text := lower(btrim(p_email));
begin
  -- Reintento del mismo pedido: se devuelve el que ya existe.
  select o.id, o.numero, o.total into v_order_id, v_numero, v_total
  from public.orders o where o.idempotency_key = p_idempotency_key;
  if found then
    return query select v_order_id, v_numero, v_total, true;
    return;
  end if;
  v_total := 0;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'NEV:sin_entradas';
  end if;

  select * into v_event from public.events e where e.id = p_event_id for share;
  if not found or not v_event.publicado then
    raise exception 'NEV:evento_no_disponible';
  end if;
  if not v_event.ventas_abiertas then
    raise exception 'NEV:ventas_cerradas';
  end if;

  if p_seller_id is not null
     and not exists (select 1 from public.sellers s where s.id = p_seller_id and s.activo) then
    raise exception 'NEV:rrpp_no_disponible';
  end if;

  -- Evento con palabra clave: se vuelve a controlar acá (la página no alcanza).
  if v_event.acceso = 'clave'
     and public.clave_normalizada(v_event.clave_acceso) is distinct from public.clave_normalizada(p_clave) then
    raise exception 'NEV:clave_incorrecta';
  end if;

  -- Evento con lista: solo los invitados. Se bloquea al invitado para que dos compras a la vez
  -- no pasen su máximo.
  if v_event.acceso = 'lista' then
    select * into v_guest from public.event_guests g
    where g.event_id = p_event_id and g.email = v_email and g.activo
    for update;
    if not found then
      raise exception 'NEV:no_invitado';
    end if;
    select greatest(v_guest.max_entradas - oc.usadas, 0) into v_restantes
    from public.event_guest_ocupacion oc where oc.guest_id = v_guest.id;
    v_seller_id := coalesce(v_guest.seller_id, p_seller_id);
  end if;

  -- Límites anti abuso.
  if p_ip_hash is not null and (
       select count(*) from public.orders o
       where o.ip_hash = p_ip_hash and o.creado_en > now() - interval '10 minutes'
     ) >= 8 then
    raise exception 'NEV:demasiados_pedidos';
  end if;
  if (select count(*) from public.orders o
      where lower(o.comprador_email) = v_email
        and o.status = 'pendiente_pago' and o.vence_en > now()) >= 3 then
    raise exception 'NEV:demasiados_pendientes';
  end if;

  -- Libera reservas vencidas de este evento.
  update public.orders o set status = 'vencido'
  where o.event_id = p_event_id and o.status = 'pendiente_pago' and o.vence_en <= now();

  insert into public.orders (
    event_id, comprador_nombre, comprador_apellido, comprador_email, comprador_whatsapp,
    seller_id, invitado_id, origen, metodo_pago, total, status, vence_en, idempotency_key, token_hash, ip_hash
  ) values (
    p_event_id, btrim(p_nombre), btrim(p_apellido), v_email, nullif(btrim(p_whatsapp), ''),
    v_seller_id, v_guest.id, 'web', 'transferencia_web', 0, 'pendiente_pago', now() + v_plazo,
    p_idempotency_key, p_token_hash, p_ip_hash
  )
  returning id, orders.numero into v_order_id, v_numero;

  -- Tipos en orden fijo (evita bloqueos cruzados entre compras simultáneas).
  for v_item in
    select (x->>'ticket_type_id')::uuid as ticket_type_id, sum((x->>'cantidad')::integer) as cantidad
    from jsonb_array_elements(p_items) x
    group by 1
    order by 1
  loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'NEV:cantidad_invalida';
    end if;

    select * into v_tipo from public.ticket_types t
    where t.id = v_item.ticket_type_id and t.event_id = p_event_id
    for update;
    if not found or not v_tipo.en_venta then
      raise exception 'NEV:tipo_no_disponible';
    end if;
    if v_item.cantidad > v_tipo.max_por_compra then
      raise exception 'NEV:cantidad_maxima' using detail = v_tipo.nombre;
    end if;

    select oc.ocupadas into v_ocupadas
    from public.ticket_type_ocupacion oc where oc.ticket_type_id = v_tipo.id;
    if v_ocupadas + v_item.cantidad > v_tipo.cupo_total then
      raise exception 'NEV:sin_cupo' using detail = v_tipo.nombre;
    end if;

    insert into public.order_items (order_id, ticket_type_id, cantidad, precio_unitario,
                                    comision_unitaria, subtotal)
    values (v_order_id, v_tipo.id, v_item.cantidad, v_tipo.precio,
            v_tipo.comision_rrpp, v_item.cantidad * v_tipo.precio);

    v_total := v_total + v_item.cantidad * v_tipo.precio;
    v_unidades := v_unidades + v_item.cantidad;
  end loop;

  if v_unidades > 20 then
    raise exception 'NEV:cantidad_maxima';
  end if;
  if v_guest.id is not null and v_unidades > v_restantes then
    raise exception 'NEV:supera_invitacion' using detail = v_restantes::text;
  end if;

  update public.orders o set total = v_total where o.id = v_order_id;

  return query select v_order_id, v_numero, v_total, false;

exception
  -- Dos envíos del mismo pedido a la vez: el segundo devuelve el primero.
  when unique_violation then
    select o.id, o.numero, o.total into v_order_id, v_numero, v_total
    from public.orders o where o.idempotency_key = p_idempotency_key;
    if not found then
      raise;
    end if;
    return query select v_order_id, v_numero, v_total, true;
end;
$$;

-- ───────── El link del pedido dice cómo se paga ─────────
create or replace function public.pedido_por_token(p_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero', o.numero,
    'status', case when o.status = 'pendiente_pago' and o.vence_en <= now()
                   then 'vencido' else o.status end,
    'total', o.total,
    'metodo', o.metodo_pago,
    'comprador_nombre', o.comprador_nombre,
    'comprador_email', o.comprador_email,
    'creado_en', o.creado_en,
    'vence_en', o.vence_en,
    'evento', jsonb_build_object(
      'nombre', e.nombre, 'subtitulo', e.subtitulo, 'fecha_inicio', e.fecha_inicio,
      'lugar', e.lugar, 'ciudad', e.ciudad
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', t.nombre, 'cantidad', i.cantidad,
               'precio_unitario', i.precio_unitario, 'subtotal', i.subtotal
             ) order by t.orden, t.nombre)
      from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id
      where i.order_id = o.id
    ), '[]'::jsonb),
    'entradas_emitidas', (select count(*) from public.tickets k
                          where k.order_id = o.id and k.status <> 'anulada'),
    -- Las entradas del pedido (para mostrar los QR en el link privado una vez aprobado).
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'titular', k.titular_nombre, 'tipo', t.nombre, 'qr_token', k.qr_token, 'status', k.status
             ) order by t.orden, k.titular_nombre)
      from public.tickets k join public.ticket_types t on t.id = k.ticket_type_id
      where k.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.events e on e.id = o.event_id
  where o.token_hash = p_token_hash;
$$;

-- ───────── El comprador sube el comprobante ─────────
-- Lo llama solo el servidor (service_role), después de guardar el archivo en el Storage privado.
-- Si la reserva ya venció, se acepta igual mientras quede cupo (la persona ya transfirió).
create or replace function public.registrar_comprobante(
  p_token_hash text,
  p_path       text,
  p_sha256     text,
  p_tipo       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item  record;
  v_ocupadas integer;
begin
  select * into v_order from public.orders o where o.token_hash = p_token_hash for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_order.origen <> 'web' or v_order.metodo_pago <> 'transferencia_web' then
    raise exception 'NEV:estado_invalido';
  end if;
  if v_order.status = 'por_confirmar' then
    raise exception 'NEV:ya_enviado';
  end if;
  if v_order.status not in ('pendiente_pago', 'vencido') then
    raise exception 'NEV:estado_invalido' using detail = v_order.status;
  end if;

  -- Vencido: vuelve a tomar el cupo solo si todavía alcanza (tipos en orden fijo, como al comprar).
  if v_order.status = 'vencido' or v_order.vence_en <= now() then
    for v_item in
      select i.ticket_type_id, i.cantidad, t.cupo_total, t.nombre
      from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id
      where i.order_id = v_order.id
      order by i.ticket_type_id
    loop
      perform 1 from public.ticket_types t where t.id = v_item.ticket_type_id for update;
      select oc.ocupadas into v_ocupadas
      from public.ticket_type_ocupacion oc where oc.ticket_type_id = v_item.ticket_type_id;
      if v_ocupadas + v_item.cantidad > v_item.cupo_total then
        update public.orders o set status = 'vencido' where o.id = v_order.id;
        raise exception 'NEV:sin_cupo' using detail = v_item.nombre;
      end if;
    end loop;
  end if;

  if exists (select 1 from public.payments p where p.comprobante_sha256 = p_sha256) then
    raise exception 'NEV:comprobante_repetido';
  end if;

  insert into public.payments (order_id, medio, monto, status, comprobante_path, comprobante_sha256, comprobante_tipo)
  values (v_order.id, 'transferencia_web', v_order.total, 'pendiente', p_path, p_sha256, p_tipo);

  update public.orders o set status = 'por_confirmar', actualizado_en = now() where o.id = v_order.id;

  insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
  values (null, 'comprobante_subido', 'orders', v_order.id::text,
          jsonb_build_object('status', v_order.status),
          jsonb_build_object('status', 'por_confirmar', 'numero', v_order.numero));

  return jsonb_build_object('numero', v_order.numero, 'status', 'por_confirmar');
exception
  when unique_violation then
    raise exception 'NEV:comprobante_repetido';
end;
$$;

revoke execute on function public.registrar_comprobante(text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_comprobante(text, text, text, text) to service_role;

