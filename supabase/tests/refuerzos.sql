-- Pruebas de los refuerzos de seguridad (0013). Corre al final.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

\set admin '\'a0000000-0000-0000-0000-00000000000a\''
\set lucas '\'a0000000-0000-0000-0000-00000000000b\''

-- 1. Columnas del link privado
select pruebas.igual('un RRPP no puede leer la clave de la que sale el link privado',
  pruebas.correr('select idempotency_key from public.orders', 'authenticated', :lucas), '42501');
select pruebas.igual('ni la huella del link',
  pruebas.correr('select token_hash from public.orders', 'authenticated', :lucas), '42501');
select pruebas.igual('el admin tampoco: solo el servidor',
  pruebas.correr('select token_hash, ip_hash from public.orders', 'authenticated', :admin), '42501');
select pruebas.igual('el RRPP sigue viendo los datos de sus ventas',
  pruebas.correr('select numero, total, status from public.orders', 'authenticated', :lucas), 'ok');

-- 2. Tope de entradas en espera por mail
create temp table antes_r as select id, acceso, ventas_abiertas from public.events where publicado;
update public.events set acceso = 'publico', ventas_abiertas = true where publicado;
insert into public.ticket_types (event_id, nombre, precio, cupo_total, max_por_compra, orden)
select id, 'Prueba tope', 1000, 500, 10, 6 from public.events where publicado;
create function pruebas.reservar(mail text, cantidad integer, ip text default null) returns text language plpgsql as $$
begin
  perform public.crear_pedido_web(
    (select id from public.events where publicado),
    jsonb_build_array(jsonb_build_object('ticket_type_id',
      (select id from public.ticket_types where nombre = 'Prueba tope'), 'cantidad', cantidad)),
    'Rita', 'Reserva', mail, '', null, gen_random_uuid(), encode(sha256(gen_random_uuid()::text::bytea), 'hex'), ip, null);
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
select pruebas.igual('20 entradas en espera con el mismo mail: se puede',
  pruebas.reservar('rita@example.com', 10) || ',' || pruebas.reservar('rita@example.com', 10), 'ok,ok');
select pruebas.igual('la número 21 ya no: tiene que pagar o esperar',
  pruebas.reservar('rita@example.com', 1), 'NEV:demasiados_pendientes');
select pruebas.igual('y el pedido rechazado no quedó a medias',
  (select count(*)::text from public.orders where comprador_email = 'rita@example.com'), '2');
select pruebas.igual('con mails distintos desde la misma conexión, el tope es 40',
  pruebas.reservar('a1@example.com', 10, 'ip-tope') || ',' || pruebas.reservar('a2@example.com', 10, 'ip-tope') || ',' ||
  pruebas.reservar('a3@example.com', 10, 'ip-tope') || ',' || pruebas.reservar('a4@example.com', 10, 'ip-tope') || ',' ||
  pruebas.reservar('a5@example.com', 1, 'ip-tope'),
  'ok,ok,ok,ok,NEV:demasiados_pendientes');

-- 3. Límite de intentos
select pruebas.igual('el límite de intentos corta al llegar al máximo',
  (select string_agg(public.intento_permitido('prueba:x', 3, 15)::text, ',') from generate_series(1, 4)),
  'true,true,true,false');
select pruebas.igual('otra clave no se ve afectada',
  public.intento_permitido('prueba:y', 3, 15)::text, 'true');
select pruebas.igual('el público no puede llamar al contador',
  pruebas.correr($$select public.intento_permitido('z', 3, 15)$$, 'anon'), '42501');
select pruebas.igual('ni leer los intentos',
  pruebas.correr('select 1 from public.intentos', 'authenticated', :lucas), '42501');

-- 4. Invitados del RRPP
select pruebas.igual('un RRPP no carga invitados en un evento sin lista',
  pruebas.correr(format($$insert into public.event_guests (event_id, email, nombre, seller_id, creado_por)
    values (%L, 'colado@example.com', 'Colado', %L, %L)$$,
    (select id from public.events where publicado), (select id from public.sellers where codigo = 'lucas'), :lucas),
    'authenticated', :lucas), '42501');
select pruebas.igual('ni le cambia el mail a un invitado suyo',
  pruebas.correr($$update public.event_guests set email = 'otro@example.com' where email = 'amigo@example.com'$$,
    'authenticated', :lucas), '42501');
select pruebas.igual('pero sí lo da de baja',
  pruebas.correr($$update public.event_guests set activo = false where email = 'amigo@example.com'$$,
    'authenticated', :lucas), 'ok');

update public.events e set acceso = a.acceso, ventas_abiertas = a.ventas_abiertas from antes_r a where a.id = e.id;
update public.ticket_types set en_venta = false where nombre = 'Prueba tope';
update public.orders set status = 'cancelado', vence_en = null
where comprador_email in ('rita@example.com', 'a1@example.com', 'a2@example.com', 'a3@example.com', 'a4@example.com');
