-- Pruebas de Mercado Pago y del registro de mails (0012). Corre después de transferencia.sql.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

create temp table antes_mp as
select id, acceso, ventas_abiertas from public.events where publicado;
update public.events set acceso = 'publico', ventas_abiertas = true where publicado;
insert into public.ticket_types (event_id, nombre, precio, cupo_total, orden)
select id, 'Prueba MP', 12000, 5, 7 from public.events where publicado;

create function pruebas.pedido_mp(mail text) returns text language plpgsql as $$
declare
  v_hash text := encode(sha256(gen_random_uuid()::text::bytea), 'hex');
begin
  perform public.crear_pedido_web(
    (select id from public.events where publicado),
    jsonb_build_array(jsonb_build_object('ticket_type_id',
      (select id from public.ticket_types where nombre = 'Prueba MP'), 'cantidad', 1)),
    'Pablo', 'Mercado', mail, '', null, gen_random_uuid(), v_hash, null, null);
  return (select numero from public.orders where token_hash = v_hash);
end;
$$;
create function pruebas.pago_mp(numero text, pago text, monto integer, estado text default 'approved')
returns text language plpgsql as $$
begin
  return public.registrar_pago_mp(numero, pago, monto, estado, '{}'::jsonb);
exception when others then
  return sqlerrm;
end;
$$;

create temp table m as select pruebas.pedido_mp('pablo@example.com') as n;

select pruebas.igual('el público no puede registrar pagos de Mercado Pago',
  pruebas.correr(format($$select public.registrar_pago_mp(%L, '111', 12000, 'approved', '{}')$$, (select n from m)), 'anon'),
  '42501');
select pruebas.igual('un RRPP o admin conectado tampoco: solo el servidor',
  pruebas.correr(format($$select public.registrar_pago_mp(%L, '111', 12000, 'approved', '{}')$$, (select n from m)), 'authenticated'),
  '42501');
select pruebas.igual('un pago todavía no aprobado no cambia el pedido',
  pruebas.pago_mp((select n from m), '1001', 12000, 'in_process') || ':' ||
  (select status from public.orders where numero = (select n from m)),
  'ignorado:pendiente_pago');
select pruebas.igual('un pago por menos del total no da el pedido por pagado',
  pruebas.pago_mp((select n from m), '1002', 100) || ':' ||
  (select status from public.orders where numero = (select n from m)),
  'monto_distinto:pendiente_pago');
select pruebas.igual('el pago aprobado por el total deja el pedido «pagado», por Mercado Pago',
  pruebas.pago_mp((select n from m), '1003', 12000) || ':' ||
  pruebas.q($q$select status || ':' || metodo_pago from public.orders where numero = (select n from m)$q$),
  'pagado:pagado:mercadopago');
select pruebas.igual('todavía no hay entradas: falta que el admin apruebe',
  (select count(*)::text from public.tickets t join public.orders o on o.id = t.order_id where o.numero = (select n from m)),
  '0');
select pruebas.igual('el mismo aviso repetido no duplica el pago',
  pruebas.pago_mp((select n from m), '1003', 12000) || ':' ||
  (select count(*)::text from public.payments p join public.orders o on o.id = p.order_id
   where o.numero = (select n from m) and p.mp_payment_id = '1003'),
  'ya_registrado:1');
select pruebas.igual('un número de pago con formato raro se rechaza',
  pruebas.pago_mp((select n from m), '12; drop', 12000), 'NEV:pago_invalido');
select pruebas.igual('un pedido que no existe no registra nada',
  pruebas.pago_mp('NEV-999999', '1004', 12000), 'NEV:no_existe');
select pruebas.igual('el admin aprueba y recién ahí sale la entrada',
  pruebas.admin_valor(format($$select public.admin_aprobar_pedido(%L)::text$$,
    (select id from public.orders where numero = (select n from m)))),
  '1');
select pruebas.igual('un segundo pago sobre un pedido ya aprobado queda anotado para devolver',
  pruebas.pago_mp((select n from m), '1005', 12000) || ':' ||
  pruebas.q($q$select count(*)::text from public.audit_log where accion = 'pago_mp_sobre_pedido_cerrado'$q$),
  'pedido_cerrado:1');
select pruebas.igual('una devolución queda anotada en el pago',
  pruebas.pago_mp((select n from m), '1003', 12000, 'refunded') || ':' ||
  pruebas.q($q$select status from public.payments where mp_payment_id = '1003'$q$),
  'reembolsado:reembolsado');

-- Pago que llega con la reserva vencida: el pedido igual queda pagado para que el admin decida.
create temp table m2 as select pruebas.pedido_mp('tarde-mp@example.com') as n;
update public.orders set vence_en = now() - interval '1 minute' where numero = (select n from m2);
select pruebas.igual('si pagó con la reserva vencida, igual queda «pagado» a la espera del admin',
  pruebas.pago_mp((select n from m2), '2001', 12000) || ':' ||
  pruebas.q($q$select status from public.orders where numero = (select n from m2)$q$),
  'pagado:pagado');

-- Mails
select pruebas.igual('el registro de mails acepta el aviso de pedido rechazado',
  pruebas.correr($$insert into public.email_log (tipo, destinatario) values ('pedido_rechazado', 'a@example.com')$$), 'ok');
select pruebas.igual('y no acepta tipos inventados',
  pruebas.correr($$insert into public.email_log (tipo, destinatario) values ('otro', 'a@example.com')$$), '23514');
select pruebas.igual('el público no lee el registro de mails',
  pruebas.correr($$select 1 from public.email_log$$, 'anon'), '42501');

update public.events e set acceso = a.acceso, ventas_abiertas = a.ventas_abiertas from antes_mp a where a.id = e.id;
update public.ticket_types set en_venta = false where nombre = 'Prueba MP';
