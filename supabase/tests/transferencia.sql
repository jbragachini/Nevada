-- Pruebas del pago por transferencia con comprobante (0011). Corre después de puerta.sql.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

create temp table antes as
select id, acceso, ventas_abiertas from public.events where publicado;
update public.events set acceso = 'publico', ventas_abiertas = true where publicado;
insert into public.ticket_types (event_id, nombre, precio, cupo_total, orden)
select id, 'Prueba transferencia', 10000, 2, 8 from public.events where publicado;

-- Crea un pedido web de `cantidad` entradas del tipo de prueba; devuelve el token_hash.
create function pruebas.pedido_transf(mail text, cantidad integer) returns text language plpgsql as $$
declare
  v_hash text := encode(sha256(gen_random_uuid()::text::bytea), 'hex');
begin
  perform public.crear_pedido_web(
    (select id from public.events where publicado),
    jsonb_build_array(jsonb_build_object('ticket_type_id',
      (select id from public.ticket_types where nombre = 'Prueba transferencia'), 'cantidad', cantidad)),
    'Marta', 'Pinos', mail, '', null, gen_random_uuid(), v_hash, null, null);
  return v_hash;
end;
$$;
create function pruebas.huella() returns text language sql as $$
  select encode(sha256(gen_random_uuid()::text::bytea), 'hex');
$$;
create function pruebas.comprobante(hash text, huella text) returns text language plpgsql as $$
begin
  return public.registrar_comprobante(hash, 'comprobantes/prueba.jpg', huella, 'image/jpeg') ->> 'status';
exception when others then
  return sqlerrm;
end;
$$;

create temp table t as select pruebas.pedido_transf('marta@example.com', 1) as h, pruebas.huella() as f;

select pruebas.igual('la compra web queda por transferencia, con 60 minutos para pagar',
  (select metodo_pago || ':' || status || ':' || (extract(epoch from vence_en - creado_en) / 60)::int
   from public.orders where token_hash = (select h from t)),
  'transferencia_web:pendiente_pago:60');
select pruebas.igual('el público no puede registrar comprobantes directo en la base',
  pruebas.correr(format($$select public.registrar_comprobante(%L, 'x', %L, 'image/jpeg')$$,
                        (select h from t), (select f from t)), 'anon'), '42501');
select pruebas.igual('con el comprobante pasa a «por confirmar»',
  pruebas.comprobante((select h from t), (select f from t)), 'por_confirmar');
select pruebas.igual('queda el pago pendiente con el monto y el comprobante',
  (select p.medio || ':' || p.status || ':' || p.monto || ':' || p.comprobante_path from public.payments p
   join public.orders o on o.id = p.order_id where o.token_hash = (select h from t)),
  'transferencia_web:pendiente:10000:comprobantes/prueba.jpg');
select pruebas.igual('no se manda dos veces',
  pruebas.comprobante((select h from t), pruebas.huella()), 'NEV:ya_enviado');

create temp table t2 as select pruebas.pedido_transf('otra@example.com', 1) as h;
select pruebas.igual('el mismo comprobante no sirve para otro pedido',
  pruebas.comprobante((select h from t2), (select f from t)), 'NEV:comprobante_repetido');
select pruebas.igual('un link que no existe no registra nada',
  pruebas.comprobante(repeat('0', 64), pruebas.huella()), 'NEV:no_existe');

-- Reserva vencida: se acepta si queda cupo (cupo 2: una de Marta + esta).
update public.orders set vence_en = now() - interval '1 minute' where token_hash = (select h from t2);
select pruebas.igual('vencida pero con cupo, se acepta igual',
  pruebas.comprobante((select h from t2), pruebas.huella()), 'por_confirmar');
create function pruebas.intentar_pedido(mail text) returns text language plpgsql as $$
begin
  perform pruebas.pedido_transf(mail, 1);
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
select pruebas.igual('si no queda cupo, ya no se puede comprar',
  pruebas.intentar_pedido('tarde@example.com'), 'NEV:sin_cupo');

select pruebas.igual('el admin aprueba y salen las entradas',
  pruebas.admin_valor(format($$select public.admin_aprobar_pedido(%L)::text$$,
    (select id from public.orders where token_hash = (select h from t)))) || ':' ||
  pruebas.q($q$select p.status from public.payments p join public.orders o on o.id = p.order_id
               where o.token_hash = (select h from t)$q$),
  '1:acreditado');
select pruebas.igual('el comprador ve el pedido aprobado con su entrada',
  (select (j ->> 'status') || ':' || jsonb_array_length(j -> 'entradas')
   from (select public.pedido_por_token((select h from t)) j) x),
  'aprobado:1');

update public.events e set acceso = a.acceso, ventas_abiertas = a.ventas_abiertas from antes a where a.id = e.id;
update public.ticket_types set en_venta = false where nombre = 'Prueba transferencia';
