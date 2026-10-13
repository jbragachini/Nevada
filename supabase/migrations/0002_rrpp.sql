-- Nevada Producciones 2026
-- 0002: RRPP (vendedores / promotores) visibles en la página de venta.
-- El comprador puede elegir, de forma OPCIONAL, qué RRPP le vendió; la comisión se asigna a ese RRPP.
-- Usuarios, contraseñas y paneles de RRPP se completan en la etapa 3.

create table if not exists public.sellers (
  id                  uuid primary key default gen_random_uuid(),
  nombre_publico      text        not null,             -- cómo aparece en la lista de la página
  codigo              text        not null unique       -- para el link personal: ?rrpp=codigo
                      check (codigo ~ '^[a-z0-9-]{2,30}$'),
  profile_id          uuid unique,                      -- usuario de acceso (etapa 3)
  puede_cargar_ventas boolean     not null default false,
  activo              boolean     not null default true,
  creado_en           timestamptz not null default now()
);

-- Vista pública: solo nombre y código de los RRPP activos.
create or replace view public.storefront_sellers
with (security_invoker = true) as
select id, nombre_publico, codigo
from public.sellers
where activo;

alter table public.sellers enable row level security;

drop policy if exists "rrpp activos visibles" on public.sellers;
create policy "rrpp activos visibles"
  on public.sellers for select
  to anon, authenticated
  using (activo);

grant select on public.storefront_sellers to anon, authenticated;
