-- Nevada Producciones
-- 0005: lo que necesita la página de venta y el seguimiento del comprador.
--   • Vistas públicas: el evento en la página, sus tipos con lo disponible y los RRPP activos.
--   • crear_pedido_web(): crea el pedido de una compra web, con montos calculados acá.
--   • pedido_por_token(): estado del pedido para el link privado /pedido/[token].
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
       e.descripcion, e.flyer_path, e.ventas_abiertas
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
-- Crear pedido web.
-- Controles: evento en la página y con ventas abiertas, tipos del evento y a la venta, cantidades
-- dentro del máximo, cupo (con los tipos bloqueados mientras se cuenta, así dos compras a la vez
-- no sobrevenden), RRPP activo, límite de pedidos por IP y por mail, y pedido único por
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
  p_ip_hash         text
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
    seller_id, origen, metodo_pago, total, status, vence_en, idempotency_key, token_hash, ip_hash
  ) values (
    p_event_id, btrim(p_nombre), btrim(p_apellido), v_email, nullif(btrim(p_whatsapp), ''),
    p_seller_id, 'web', 'mercadopago', 0, 'pendiente_pago', now() + v_plazo,
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
                          where k.order_id = o.id and k.status <> 'anulada')
  )
  from public.orders o
  join public.events e on e.id = o.event_id
  where o.token_hash = p_token_hash;
$$;

revoke execute on function public.crear_pedido_web(uuid, jsonb, text, text, text, text, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.pedido_por_token(text) from public, anon, authenticated;
grant execute on function public.crear_pedido_web(uuid, jsonb, text, text, text, text, uuid, uuid, text, text)
  to service_role;
grant execute on function public.pedido_por_token(text) to service_role;
