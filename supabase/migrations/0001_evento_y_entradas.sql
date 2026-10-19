-- Nevada Producciones
-- 0001: eventos y tipos de entrada.
-- Varios eventos editables; uno solo «en la página» (publicado) a la vez.
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
  creado_por      uuid        references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_por uuid        references auth.users(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);

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
