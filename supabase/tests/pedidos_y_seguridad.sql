-- Pruebas de la etapa 2: pedidos web, cupo, idempotencia, límites y permisos (RLS).
-- Se ejecutan con scripts/probar-base.sh sobre una base local recién creada.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

create schema pruebas;

-- Corre `sql` como `rol` (y usuario `sub`) y devuelve el código de error, o 'ok'.
create function pruebas.correr(sql text, rol text default 'service_role', sub uuid default null)
returns text language plpgsql as $$
declare
  v_err text;
begin
  perform set_config('request.jwt.claims',
                     coalesce(jsonb_build_object('sub', sub)::text, '{}'), true);
  perform set_config('role', rol, true);
  begin
    execute sql;
  exception when others then
    v_err := case when sqlerrm like 'NEV:%' then split_part(sqlerrm, ' ', 1) else sqlstate end;
  end;
  perform set_config('role', 'postgres', true);
  return coalesce(v_err, 'ok');
end;
$$;

-- Corre `sql` como `rol` y después, ya con el cambio a la vista, devuelve error:resultado de `consulta`.
create function pruebas.correr_y_ver(sql text, rol text, sub uuid, consulta text)
returns text language plpgsql as $$
declare
  v_res text;
  v_cod text := pruebas.correr(sql, rol, sub);
begin
  execute consulta into v_res;
  return v_cod || ':' || coalesce(v_res, 'null');
end;
$$;

create function pruebas.cuenta(sql text, rol text, sub uuid default null)
returns bigint language plpgsql as $$
declare
  n bigint;
begin
  perform set_config('request.jwt.claims',
                     coalesce(jsonb_build_object('sub', sub)::text, '{}'), true);
  perform set_config('role', rol, true);
  execute 'select count(*) from (' || sql || ') q' into n;
  perform set_config('role', 'postgres', true);
  return n;
end;
$$;

create function pruebas.igual(nombre text, obtenido anyelement, esperado anyelement)
returns void language plpgsql as $$
begin
  if obtenido is distinct from esperado then
    raise exception 'FALLA: % — se obtuvo «%», se esperaba «%»', nombre, obtenido, esperado;
  end if;
  raise notice 'ok  %', nombre;
end;
$$;

-- Compra web armada como la arma el servidor.
create function pruebas.pedido(items jsonb, email text default 'ana@example.com',
                               seller uuid default null, clave uuid default gen_random_uuid(),
                               ip text default null, palabra text default null)
returns text language sql as $$
  select format(
    'select * from public.crear_pedido_web(%L, %L::jsonb, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
    (select id from public.events where publicado), items, 'Ana', 'Pérez', email, '',
    seller, clave, encode(digest(clave::text, 'sha256'), 'hex'), ip, palabra
  );
$$;

create function pruebas.tipo(nombre text) returns uuid language sql as $$
  select id from public.ticket_types where ticket_types.nombre = tipo.nombre;
$$;

set client_min_messages = notice;

-- ───────── Página pública ─────────
select pruebas.igual('el público ve el evento en la página',
  pruebas.cuenta('select * from public.storefront_event', 'anon'), 1::bigint);
select pruebas.igual('los tipos a la venta muestran su disponible',
  (select string_agg(nombre || '=' || disponibles, ',' order by orden) from public.storefront_ticket_types),
  'Entrada General=400,Entrada +25=200');
select pruebas.igual('el público lee los tipos a la venta con su propio rol',
  pruebas.correr('select * from public.storefront_ticket_types', 'anon'), 'ok');
select pruebas.igual('el público no lee la ocupación interna',
  pruebas.correr('select * from public.ticket_type_ocupacion', 'anon'), '42501');
select pruebas.igual('la vista pública no expone la comisión',
  (select count(*) from information_schema.columns
   where table_name = 'storefront_ticket_types' and column_name in ('comision_rrpp', 'cupo_total')),
  0::bigint);
select pruebas.igual('el público no lee la tabla de eventos directo',
  pruebas.correr('select * from public.events', 'anon'), '42501');
select pruebas.igual('el público no lee tipos de entrada directo',
  pruebas.correr('select * from public.ticket_types', 'anon'), '42501');
select pruebas.igual('el público no lee pedidos',
  pruebas.correr('select * from public.orders', 'anon'), '42501');
select pruebas.igual('el público no puede modificar el evento a través de la vista',
  pruebas.correr($$update public.storefront_event set nombre = 'x'$$, 'anon'), '42501');
select pruebas.igual('el público no puede crear RRPP a través de la vista',
  pruebas.correr($$insert into public.storefront_sellers (nombre_publico, codigo) values ('x', 'xx')$$, 'anon'),
  '42501');
select pruebas.igual('el público no puede crear pedidos por su cuenta',
  pruebas.correr(pruebas.pedido('[]'), 'anon'), '42501');
select pruebas.igual('un usuario logueado tampoco puede crear pedidos web',
  pruebas.correr(pruebas.pedido('[]'), 'authenticated'), '42501');
select pruebas.igual('el público no consulta pedidos por token',
  pruebas.correr($$select public.pedido_por_token(repeat('a', 64))$$, 'anon'), '42501');

-- ───────── Crear pedidos ─────────
select pruebas.igual('con ventas cerradas no se puede comprar',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)))),
  'NEV:ventas_cerradas');

update public.events set ventas_abiertas = true where publicado;

create temp table r as
select * from public.crear_pedido_web(
  (select id from public.events where publicado),
  jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 2),
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada +25'), 'cantidad', 1)),
  ' Ana ', 'Pérez', ' Ana@Example.com ', '', null,
  '00000000-0000-0000-0000-000000000001', repeat('b', 64), 'ip-1');

select pruebas.igual('el total se calcula con los precios de la base', (select total from r), 50000);
select pruebas.igual('el número de pedido es NEV-000001', (select numero from r), 'NEV-000001');
select pruebas.igual('queda pendiente de pago con plazo de 30 minutos',
  (select status || ':' || (extract(epoch from vence_en - creado_en) / 60)::int
   from public.orders where id = (select order_id from r)), 'pendiente_pago:30');
select pruebas.igual('el mail se guarda limpio y en minúsculas',
  (select comprador_email || '|' || comprador_nombre from public.orders where id = (select order_id from r)),
  'ana@example.com|Ana');
select pruebas.igual('el cupo se reserva mientras se paga',
  (select string_agg(disponibles::text, ',' order by orden) from public.storefront_ticket_types),
  '398,199');

select pruebas.igual('reintentar con la misma clave devuelve el mismo pedido',
  (select ya_existia::text || ':' || numero from public.crear_pedido_web(
    (select id from public.events where publicado),
    jsonb_build_array(jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 9)),
    'Otro', 'Nombre', 'otro@example.com', '', null,
    '00000000-0000-0000-0000-000000000001', repeat('c', 64), 'ip-1')),
  'true:NEV-000001');
select pruebas.igual('y no se crea un pedido nuevo', (select count(*) from public.orders), 1::bigint);

select pruebas.igual('no se puede pedir sin entradas', pruebas.correr(pruebas.pedido('[]')), 'NEV:sin_entradas');
select pruebas.igual('cantidad cero rechazada',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 0)))),
  'NEV:cantidad_invalida');
select pruebas.igual('más del máximo por compra rechazado',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 11)))),
  'NEV:cantidad_maxima');
select pruebas.igual('un tipo inexistente se rechaza',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', gen_random_uuid(), 'cantidad', 1)))),
  'NEV:tipo_no_disponible');

update public.ticket_types set en_venta = false where nombre = 'Entrada +25';
select pruebas.igual('un tipo sacado de la venta se rechaza',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada +25'), 'cantidad', 1)))),
  'NEV:tipo_no_disponible');
update public.ticket_types set en_venta = true where nombre = 'Entrada +25';

-- Tipo de otro evento (borrador, fuera de la página).
insert into public.events (nombre, fecha_inicio, lugar, publicado, ventas_abiertas)
values ('Otro evento', now() + interval '60 days', 'Club', false, true);
insert into public.ticket_types (event_id, nombre, precio, cupo_total)
select id, 'Tipo de otro evento', 1, 10 from public.events where nombre = 'Otro evento';
select pruebas.igual('un tipo de otro evento se rechaza',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Tipo de otro evento'), 'cantidad', 1)))),
  'NEV:tipo_no_disponible');
select pruebas.igual('no puede haber dos eventos en la página',
  pruebas.correr($$update public.events set publicado = true where nombre = 'Otro evento'$$, 'postgres'),
  '23505');

-- ───────── Cupo ─────────
insert into public.ticket_types (event_id, nombre, precio, cupo_total, orden)
select id, 'VIP', 50000, 3, 3 from public.events where publicado;
select pruebas.igual('compra que entra justo en el cupo',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('VIP'), 'cantidad', 2)), 'b@example.com')),
  'ok');
select pruebas.igual('compra que pasa el cupo se rechaza',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('VIP'), 'cantidad', 2)), 'c@example.com')),
  'NEV:sin_cupo');
select pruebas.igual('el cupo no puede bajar de lo vendido',
  pruebas.correr($$update public.ticket_types set cupo_total = 1 where nombre = 'VIP'$$, 'postgres'),
  'NEV:cupo_menor_que_vendido');
select pruebas.igual('un tipo con ventas no se puede borrar',
  pruebas.correr($$delete from public.ticket_types where nombre = 'VIP'$$, 'postgres'), '23503');

update public.orders set vence_en = now() - interval '1 minute', creado_en = now() - interval '31 minutes'
where comprador_email = 'b@example.com';
select pruebas.igual('una reserva vencida libera el cupo',
  (select disponibles from public.storefront_ticket_types where nombre = 'VIP'), 3);
select pruebas.igual('el seguimiento muestra el pedido vencido',
  (select public.pedido_por_token(token_hash) ->> 'status' from public.orders
   where comprador_email = 'b@example.com'), 'vencido');

-- ───────── RRPP en la compra ─────────
insert into public.sellers (nombre_publico, codigo, activo) values
  ('Lucas', 'lucas', true), ('Ex RRPP', 'ex', false);
select pruebas.igual('se puede elegir un RRPP activo',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)),
    'd@example.com', (select id from public.sellers where codigo = 'lucas'))),
  'ok');
select pruebas.igual('un RRPP dado de baja no se puede elegir',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)),
    'd@example.com', (select id from public.sellers where codigo = 'ex'))),
  'NEV:rrpp_no_disponible');
select pruebas.igual('el público solo ve RRPP activos',
  pruebas.cuenta('select * from public.storefront_sellers', 'anon'), 1::bigint);
select pruebas.igual('la comisión queda congelada en el pedido',
  (select i.comision_unitaria from public.order_items i join public.orders o on o.id = i.order_id
   where o.comprador_email = 'd@example.com'), 0);

-- ───────── Límites anti abuso ─────────
\o /dev/null
select count(*) from (
  select pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'e@example.com'))
  from generate_series(1, 3)) x;
\o
select pruebas.igual('más de 3 pedidos sin pagar con el mismo mail se frena',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'E@example.com')),
  'NEV:demasiados_pendientes');
\o /dev/null
select count(*) from (
  select pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)),
    'ip' || g || '@example.com', null, gen_random_uuid(), 'ip-abuso'))
  from generate_series(1, 8) g) x;
\o
select pruebas.igual('más de 8 pedidos en 10 minutos desde la misma IP se frena',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)),
    'ip9@example.com', null, gen_random_uuid(), 'ip-abuso')),
  'NEV:demasiados_pedidos');

-- ───────── Seguimiento por token ─────────
select pruebas.igual('el seguimiento trae el pedido y sus entradas',
  (select (j ->> 'numero') || '|' || (j ->> 'status') || '|' || (j ->> 'total') || '|' ||
          jsonb_array_length(j -> 'items')
   from (select public.pedido_por_token(repeat('b', 64)) j) x),
  'NEV-000001|pendiente_pago|50000|2');
select pruebas.igual('el seguimiento no expone datos internos',
  (select public.pedido_por_token(repeat('b', 64)) ?| array['token_hash', 'ip_hash', 'seller_id', 'id']),
  false);
select pruebas.igual('un token desconocido no devuelve nada',
  (select public.pedido_por_token(repeat('f', 64))), null::jsonb);

-- ───────── Permisos de admin y RRPP (RLS) ─────────
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-00000000000a'), ('a0000000-0000-0000-0000-00000000000b'),
  ('a0000000-0000-0000-0000-00000000000c'), ('a0000000-0000-0000-0000-00000000000d');
insert into public.profiles (id, nombre, usuario, rol, activo) values
  ('a0000000-0000-0000-0000-00000000000a', 'Admin', 'admin', 'admin', true),
  ('a0000000-0000-0000-0000-00000000000b', 'Lucas', 'lucas', 'rrpp', true),
  ('a0000000-0000-0000-0000-00000000000c', 'Martina', 'martina', 'rrpp', true),
  ('a0000000-0000-0000-0000-00000000000d', 'Pendiente', 'pendiente', 'rrpp', false);
update public.sellers set profile_id = 'a0000000-0000-0000-0000-00000000000b' where codigo = 'lucas';
insert into public.sellers (profile_id, nombre_publico, codigo) values
  ('a0000000-0000-0000-0000-00000000000c', 'Martina', 'martina'),
  ('a0000000-0000-0000-0000-00000000000d', 'Pendiente', 'pendiente');

select pruebas.igual('el admin ve todos los pedidos',
  pruebas.cuenta('select * from public.orders', 'authenticated', 'a0000000-0000-0000-0000-00000000000a'),
  (select count(*) from public.orders));
select pruebas.igual('el RRPP ve solo las ventas que lo eligieron',
  pruebas.cuenta('select * from public.orders', 'authenticated', 'a0000000-0000-0000-0000-00000000000b'),
  1::bigint);
select pruebas.igual('otro RRPP no ve las ventas de Lucas',
  pruebas.cuenta('select * from public.orders', 'authenticated', 'a0000000-0000-0000-0000-00000000000c'),
  0::bigint);
select pruebas.igual('un RRPP no aprobado no ve nada',
  pruebas.cuenta('select * from public.events', 'authenticated', 'a0000000-0000-0000-0000-00000000000d'),
  0::bigint);
select pruebas.igual('el RRPP no ve los datos de la persona en una compra web',
  pruebas.cuenta('select * from public.order_attendees', 'authenticated', 'a0000000-0000-0000-0000-00000000000b'),
  0::bigint);
select pruebas.igual('el RRPP ve solo su ficha de vendedor',
  pruebas.cuenta('select * from public.sellers', 'authenticated', 'a0000000-0000-0000-0000-00000000000b'),
  1::bigint);
select pruebas.igual('el RRPP ve solo su perfil',
  pruebas.cuenta('select * from public.profiles', 'authenticated', 'a0000000-0000-0000-0000-00000000000b'),
  1::bigint);
select pruebas.igual('el RRPP no puede modificar pedidos',
  pruebas.correr($$update public.orders set total = 1$$, 'authenticated',
                 'a0000000-0000-0000-0000-00000000000b'), '42501');
select pruebas.igual('el RRPP no puede cambiar precios',
  pruebas.correr_y_ver($$update public.ticket_types set precio = 1$$, 'authenticated',
                 'a0000000-0000-0000-0000-00000000000b',
                 $$select min(precio) from public.ticket_types where nombre = 'Entrada General'$$),
  'ok:15000');
select pruebas.igual('el RRPP no puede hacerse admin',
  pruebas.correr_y_ver($$update public.profiles set rol = 'admin' where id = auth.uid()$$, 'authenticated',
                 'a0000000-0000-0000-0000-00000000000b',
                 $$select rol from public.profiles where usuario = 'lucas'$$),
  'ok:rrpp');
select pruebas.igual('ni el admin puede escribir pedidos directo desde el navegador',
  pruebas.correr($$update public.orders set total = 1$$, 'authenticated',
                 'a0000000-0000-0000-0000-00000000000a'), '42501');
select pruebas.igual('el admin sí puede editar eventos',
  pruebas.correr_y_ver($$update public.events set lugar = 'Club Nevada' where publicado$$, 'authenticated',
                 'a0000000-0000-0000-0000-00000000000a',
                 $$select lugar from public.events where publicado$$),
  'ok:Club Nevada');

-- ───────── Auditoría ─────────
insert into public.audit_log (accion, entidad) values ('prueba', 'test');
select pruebas.igual('la auditoría no se puede borrar',
  pruebas.correr($$delete from public.audit_log$$, 'postgres'), 'P0001');
select pruebas.igual('la auditoría no se puede modificar',
  pruebas.correr($$update public.audit_log set accion = 'x'$$, 'postgres'), 'P0001');
select pruebas.igual('el servidor tampoco puede borrarla',
  pruebas.correr($$delete from public.audit_log$$, 'service_role'), '42501');
