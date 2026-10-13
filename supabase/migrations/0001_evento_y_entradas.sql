-- Nevada Producciones 2026
-- 0001: configuración del evento y tipos de entrada (lo que lee la página pública).
-- Las tablas de pedidos, pagos, entradas, vendedores y comisiones llegan en 0002+.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Evento (una sola fila activa)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.event_settings (
  id              uuid primary key default gen_random_uuid(),
  nombre          text        not null,
  subtitulo       text,
  fecha_inicio    timestamptz not null,
  lugar           text        not null,
  direccion       text,
  ciudad          text        not null default 'Oncativo, Córdoba',
  ventas_abiertas boolean     not null default false,
  activo          boolean     not null default true,
  -- Único medio de pago: transferencia a la cuenta de Mercado Pago de Nevada.
  -- Se muestran al comprador después de confirmar su pedido.
  pago_entidad    text        not null default 'Mercado Pago',
  pago_titular    text,
  pago_alias      text,
  pago_cvu        text,
  -- Tiempo estimado de revisión que se le informa al comprador
  pago_demora_txt text        not null default 'dentro de las 24 horas',
  actualizado_en  timestamptz not null default now()
);

-- Solo puede haber un evento activo a la vez.
create unique index if not exists event_settings_un_activo
  on public.event_settings (activo) where activo;

-- ─────────────────────────────────────────────────────────────
-- Tipos de entrada
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ticket_types (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid        not null references public.event_settings(id) on delete cascade,
  codigo      text        not null,                 -- 'general' | 'mas25'
  nombre      text        not null,                 -- 'Entrada General'
  descripcion text,
  precio      integer     not null check (precio >= 0),          -- en pesos, sin decimales
  cupo_total  integer     not null check (cupo_total >= 0),
  vendidas    integer     not null default 0 check (vendidas >= 0),
  max_por_compra integer  not null default 10 check (max_por_compra between 1 and 50),
  en_venta    boolean     not null default true,
  orden       integer     not null default 0,
  unique (event_id, codigo),
  check (vendidas <= cupo_total)
);

-- ─────────────────────────────────────────────────────────────
-- Vista pública: solo lo que el comprador necesita ver
-- ─────────────────────────────────────────────────────────────
create or replace view public.storefront_ticket_types
with (security_invoker = true) as
select
  t.id,
  t.event_id,
  t.codigo,
  t.nombre,
  t.descripcion,
  t.precio,
  greatest(t.cupo_total - t.vendidas, 0) as disponibles,
  t.max_por_compra,
  t.en_venta,
  t.orden
from public.ticket_types t
join public.event_settings e on e.id = t.event_id and e.activo;

-- ─────────────────────────────────────────────────────────────
-- Seguridad (RLS): el público solo puede LEER el evento activo y sus entradas.
-- Escrituras: únicamente el administrador (políticas en 0002 cuando existan los roles).
-- ─────────────────────────────────────────────────────────────
alter table public.event_settings enable row level security;
alter table public.ticket_types   enable row level security;

drop policy if exists "evento activo visible" on public.event_settings;
create policy "evento activo visible"
  on public.event_settings for select
  to anon, authenticated
  using (activo);

drop policy if exists "entradas del evento activo visibles" on public.ticket_types;
create policy "entradas del evento activo visibles"
  on public.ticket_types for select
  to anon, authenticated
  using (exists (select 1 from public.event_settings e where e.id = event_id and e.activo));

grant select on public.storefront_ticket_types to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Datos iniciales (editables luego desde el panel admin).
-- Fecha y lugar quedan para completar; las ventas arrancan CERRADAS.
-- ─────────────────────────────────────────────────────────────
insert into public.event_settings (nombre, subtitulo, fecha_inicio, lugar, ciudad, ventas_abiertas)
select 'Navidad con Nevada 2026', 'DJ Nacho Heisecke', '2026-12-24 23:59:00-03', 'Lugar a confirmar', 'Oncativo, Córdoba', false
where not exists (select 1 from public.event_settings where activo);

insert into public.ticket_types (event_id, codigo, nombre, descripcion, precio, cupo_total, orden)
select e.id, v.codigo, v.nombre, v.descripcion, v.precio, v.cupo, v.orden
from public.event_settings e
cross join (values
  ('general', 'Entrada General', 'Acceso general al evento', 15000, 400, 1),
  ('mas25',   'Entrada +25',     'Acceso para mayores de 25', 20000, 200, 2)
) as v(codigo, nombre, descripcion, precio, cupo, orden)
where e.activo
on conflict (event_id, codigo) do nothing;
