-- Nevada Producciones
-- 0013: refuerzos de seguridad que salieron de la auditoría.

-- ───────── 1. El link privado del comprador no se puede reconstruir ─────────
-- Un RRPP ve las filas de sus ventas (RLS), pero RLS no filtra columnas: podía leer la clave de la
-- que sale el link privado de una compra web a su nombre, y con el link, los QR. Ahora nadie que
-- entre con usuario (RRPP o admin) lee esas columnas; solo el servidor.
revoke select on public.orders from authenticated;
grant select (
  id, numero, event_id, comprador_nombre, comprador_apellido, comprador_email, comprador_whatsapp,
  seller_id, invitado_id, origen, metodo_pago, total, status, vence_en, creado_por, creado_en,
  revisado_por, revisado_en, motivo_rechazo, actualizado_en
) on public.orders to authenticated;

-- ───────── 2. Nadie puede dejar el evento sin entradas sin pagar ─────────
-- Tope de entradas en espera (sin pagar o con comprobante sin revisar) por mail y por conexión.
-- Antes el tope era por cantidad de pedidos, y con mails inventados se podía reservar todo el cupo.
create or replace function public.limitar_reservas_web()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_por_mail integer;
  v_por_ip   integer;
begin
  select * into v_order from public.orders o where o.id = new.order_id;
  if v_order.origen <> 'web' or v_order.status <> 'pendiente_pago' then
    return new;
  end if;

  select coalesce(sum(i.cantidad), 0) into v_por_mail
  from public.orders o join public.order_items i on i.order_id = o.id
  where o.origen = 'web' and lower(o.comprador_email) = lower(v_order.comprador_email)
    and ((o.status = 'pendiente_pago' and o.vence_en > now()) or o.status = 'por_confirmar');
  if v_por_mail > 20 then
    raise exception 'NEV:demasiados_pendientes';
  end if;

  if v_order.ip_hash is not null then
    select coalesce(sum(i.cantidad), 0) into v_por_ip
    from public.orders o join public.order_items i on i.order_id = o.id
    where o.origen = 'web' and o.ip_hash = v_order.ip_hash
      and ((o.status = 'pendiente_pago' and o.vence_en > now()) or o.status = 'por_confirmar');
    if v_por_ip > 40 then
      raise exception 'NEV:demasiados_pendientes';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.limitar_reservas_web() from public, anon, authenticated;

create trigger order_items_limite_reservas
  after insert on public.order_items
  for each row execute function public.limitar_reservas_web();

-- ───────── 3. Límite de intentos de ingreso y de pedidos de acceso ─────────
create table public.intentos (
  id        bigint generated always as identity primary key,
  clave     text        not null check (char_length(clave) <= 100),
  creado_en timestamptz not null default now()
);
create index intentos_clave on public.intentos (clave, creado_en);
alter table public.intentos enable row level security;
revoke all on public.intentos from anon, authenticated;

-- Anota un intento y dice si todavía está dentro del límite (p_max intentos cada p_minutos).
-- La clave es un hash (de la IP o del usuario): nunca se guarda el dato original.
create or replace function public.intento_permitido(p_clave text, p_max integer, p_minutos integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.intentos i
  where i.clave = p_clave and i.creado_en > now() - make_interval(mins => p_minutos);
  if v_n >= p_max then
    return false;
  end if;
  insert into public.intentos (clave) values (p_clave);
  delete from public.intentos i where i.creado_en < now() - interval '1 day';
  return true;
end;
$$;

revoke execute on function public.intento_permitido(text, integer, integer) from public, anon, authenticated;
grant execute on function public.intento_permitido(text, integer, integer) to service_role;

-- ───────── 4. Invitados de un RRPP: solo en eventos con lista y sin cambiar de dueño ─────────
drop policy "rrpp agrega sus invitados" on public.event_guests;
create policy "rrpp agrega sus invitados" on public.event_guests
  for insert to authenticated
  with check (
    seller_id = public.mi_seller_id() and creado_por = auth.uid()
    and exists (select 1 from public.events e where e.id = event_id and e.acceso = 'lista')
  );
-- Al editar solo cambia nombre, tope y si está activo: no puede moverlo de evento ni de mail.
revoke update on public.event_guests from authenticated;
grant update (nombre, max_entradas, activo) on public.event_guests to authenticated;

-- ───────── 5. Los comprobantes, siempre en un lugar privado ─────────
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('comprobantes', 'comprobantes', false, 5242880,
            array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
    on conflict (id) do update set public = false;
  end if;
end;
$$;
