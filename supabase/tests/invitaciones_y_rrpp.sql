-- Pruebas de la etapa 3: eventos con lista de invitados o palabra clave, «¿Quién te vendió?» oculto, carga de ventas del
-- RRPP, emisión de entradas, comisiones y panel. Corre después de pedidos_y_seguridad.sql (usa sus
-- funciones de prueba y sus datos: admin «a…a», Lucas «a…b», Martina «a…c», RRPP sin aprobar «a…d»).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

\set admin '\'a0000000-0000-0000-0000-00000000000a\''
\set lucas '\'a0000000-0000-0000-0000-00000000000b\''
\set martina '\'a0000000-0000-0000-0000-00000000000c\''
\set pendiente '\'a0000000-0000-0000-0000-00000000000d\''

update auth.users set email = 'lucas@example.com' where id = :lucas;
update auth.users set email = 'admin@example.com' where id = :admin;

-- Venta del RRPP armada como la arma el servidor.
create function pruebas.cargar(personas jsonb, metodo text, clave uuid)
returns table (order_id uuid, numero text, total integer, status text, ya_existia boolean)
language sql as $$
  select * from public.cargar_venta_rrpp(
    (select id from public.events where publicado), personas, metodo, '',
    clave, encode(digest(clave::text, 'sha256'), 'hex'));
$$;
grant usage on schema pruebas to anon, authenticated;
grant execute on function pruebas.cargar(jsonb, text, uuid) to anon, authenticated;

create function pruebas.carga(personas jsonb, metodo text default 'efectivo_rrpp',
                              clave uuid default gen_random_uuid())
returns text language sql as $$
  select format('select * from pruebas.cargar(%L::jsonb, %L, %L)', personas, metodo, clave);
$$;

-- Valor de `consulta` corrida como `rol` (y usuario `sub`).
create function pruebas.valor(consulta text, rol text, sub uuid default null)
returns text language plpgsql as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims', coalesce(jsonb_build_object('sub', sub)::text, '{}'), true);
  perform set_config('role', rol, true);
  execute consulta into v;
  perform set_config('role', 'postgres', true);
  return v;
end;
$$;

create function pruebas.persona(tipo text, nombre text, email text default null)
returns jsonb language sql as $$
  select jsonb_build_object('ticket_type_id', pruebas.tipo(tipo), 'nombre', nombre, 'email', email);
$$;

-- ───────── Evento con invitación ─────────
select pruebas.igual('un evento con palabra clave necesita la palabra',
  pruebas.correr($$update public.events set acceso = 'clave' where publicado$$, 'postgres'), '23514');
update public.events set acceso = 'lista', mostrar_rrpp = false where publicado;
select pruebas.igual('la página sabe que el evento es con lista y sin «¿Quién te vendió?»',
  (select acceso || ':' || mostrar_rrpp from public.storefront_event), 'lista:false');
select pruebas.igual('quien no está en la lista no puede comprar',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'nadie@example.com')),
  'NEV:no_invitado');

select pruebas.igual('el admin invita a alguien',
  pruebas.correr(format($$insert into public.event_guests (event_id, email, nombre, max_entradas, creado_por)
    values (%L, 'vip@example.com', 'Invitada VIP', 4, %L)$$,
    (select id from public.events where publicado), :admin), 'authenticated', :admin), 'ok');
select pruebas.igual('Lucas invita a alguien a su nombre',
  pruebas.correr(format($$insert into public.event_guests (event_id, email, nombre, max_entradas, seller_id, creado_por)
    values (%L, 'amigo@example.com', 'Amigo de Lucas', 2, %L, %L)$$,
    (select id from public.events where publicado), (select id from public.sellers where codigo = 'lucas'), :lucas),
    'authenticated', :lucas), 'ok');
select pruebas.igual('Lucas no puede cargar invitados a nombre de Martina',
  pruebas.correr(format($$insert into public.event_guests (event_id, email, nombre, seller_id, creado_por)
    values (%L, 'otro@example.com', 'Otro', %L, %L)$$,
    (select id from public.events where publicado), (select id from public.sellers where codigo = 'martina'), :lucas),
    'authenticated', :lucas), '42501');
select pruebas.igual('Martina no ve los invitados de Lucas',
  pruebas.cuenta('select * from public.event_guests', 'authenticated', :martina), 0::bigint);
select pruebas.igual('Lucas ve solo los suyos',
  pruebas.cuenta('select * from public.event_guests', 'authenticated', :lucas), 1::bigint);
select pruebas.igual('el admin ve todos',
  pruebas.cuenta('select * from public.event_guests', 'authenticated', :admin), 2::bigint);
select pruebas.igual('el público no lee la lista de invitados',
  pruebas.correr('select * from public.event_guests', 'anon'), '42501');
select pruebas.igual('el público no puede preguntar por invitados directo',
  pruebas.correr($$select public.verificar_invitacion(gen_random_uuid(), 'x@example.com', null)$$, 'anon'), '42501');

select pruebas.igual('consultar la lista tiene límite por conexión',
  (select string_agg(pruebas.correr(format($$select public.verificar_invitacion(%L, 'x%s@example.com', 'ip-lista')$$,
                       (select id from public.events where publicado), g)), ',')
   from generate_series(1, 11) g) like '%ok,NEV:demasiados_intentos', true);

update public.sellers set max_invitados = 1 where codigo = 'lucas';
select pruebas.igual('Lucas no puede pasarse de su tope de invitados',
  pruebas.correr(format($$insert into public.event_guests (event_id, email, nombre, seller_id, creado_por)
    values (%L, 'tercero@example.com', 'Tercero', %L, %L)$$,
    (select id from public.events where publicado), (select id from public.sellers where codigo = 'lucas'), :lucas),
    'authenticated', :lucas), 'NEV:tope_invitados');

select pruebas.igual('la invitación dice cuántas entradas le quedan',
  (select public.verificar_invitacion((select id from public.events where publicado), ' Amigo@Example.com ', null)
          ->> 'restantes'), '2');
select pruebas.igual('un invitado no puede comprar más que su máximo',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 3)), 'amigo@example.com')),
  'NEV:supera_invitacion');
select pruebas.igual('un invitado compra dentro de su máximo',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 2)), 'amigo@example.com')),
  'ok');
select pruebas.igual('la compra del invitado queda para el RRPP que lo invitó',
  (select s.codigo from public.orders o join public.sellers s on s.id = o.seller_id
   where o.comprador_email = 'amigo@example.com'), 'lucas');
select pruebas.igual('ya no le quedan entradas',
  (select public.verificar_invitacion((select id from public.events where publicado), 'amigo@example.com', null)
          ->> 'restantes'), '0');
select pruebas.igual('y no puede volver a comprar',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'amigo@example.com')),
  'NEV:supera_invitacion');
update public.event_guests set activo = false where email = 'vip@example.com';
select pruebas.igual('un invitado dado de baja ya no puede comprar',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'vip@example.com')),
  'NEV:no_invitado');

-- ───────── Evento con palabra clave ─────────
update public.events set acceso = 'clave', clave_acceso = 'Navidad Nevada' where publicado;
select pruebas.igual('la palabra clave no se ve en la página pública',
  (select count(*) from information_schema.columns
   where table_name = 'storefront_event' and column_name = 'clave_acceso'), 0::bigint);
select pruebas.igual('la clave se compara sin mayúsculas, acentos ni espacios de más',
  (select public.verificar_clave((select id from public.events where publicado), '  navídad   NEVADA ', null)), true);
select pruebas.igual('una clave equivocada no pasa',
  (select public.verificar_clave((select id from public.events where publicado), 'navidad', null)), false);
select pruebas.igual('sin la clave no se puede comprar aunque se saltee la página',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'clave1@example.com')),
  'NEV:clave_incorrecta');
select pruebas.igual('con la clave equivocada tampoco',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'clave1@example.com',
    null, gen_random_uuid(), null, 'otra cosa')),
  'NEV:clave_incorrecta');
select pruebas.igual('con la clave correcta compra cualquiera',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'clave1@example.com',
    null, gen_random_uuid(), null, 'navidad nevada')),
  'ok');
select pruebas.igual('adivinar la clave tiene límite por conexión',
  (select string_agg(pruebas.correr(format($$select public.verificar_clave(%L, 'prueba%s', 'ip-clave')$$,
                       (select id from public.events where publicado), g)), ',')
   from generate_series(1, 11) g) like '%ok,NEV:demasiados_intentos', true);
select pruebas.igual('el RRPP ve la palabra clave para compartirla',
  pruebas.valor('select clave_acceso from public.events where publicado', 'authenticated', :lucas),
  'Navidad Nevada');
select pruebas.igual('el público no puede consultar la clave directo',
  pruebas.correr($$select public.verificar_clave(gen_random_uuid(), 'x', null)$$, 'anon'), '42501');

update public.events set acceso = 'publico', mostrar_rrpp = true where publicado;
select pruebas.igual('al volver a público, compra cualquiera',
  pruebas.correr(pruebas.pedido(jsonb_build_array(
    jsonb_build_object('ticket_type_id', pruebas.tipo('Entrada General'), 'cantidad', 1)), 'nadie@example.com')),
  'ok');

-- ───────── Venta cargada por el RRPP ─────────
update public.ticket_types set comision_rrpp = 1000 where nombre = 'Entrada General';

select pruebas.igual('un usuario sin aprobar no puede cargar ventas',
  pruebas.correr(pruebas.carga(jsonb_build_array(pruebas.persona('Entrada General', 'Juan Pérez', 'juan@example.com'))),
    'authenticated', :pendiente), 'NEV:sin_permiso');
select pruebas.igual('el público no puede cargar ventas',
  pruebas.correr($$select public.cargar_venta_rrpp(gen_random_uuid(), '[]', 'efectivo_rrpp', '', gen_random_uuid(), repeat('a', 64))$$,
    'anon'), '42501');
select pruebas.igual('cada persona necesita nombre y apellido',
  pruebas.correr(pruebas.carga(jsonb_build_array(
    pruebas.persona('Entrada General', 'Juan Pérez', 'juan@example.com'),
    pruebas.persona('Entrada General', 'Sofía'))), 'authenticated', :lucas), 'NEV:persona_sin_nombre');
select pruebas.igual('la persona 1 necesita mail',
  pruebas.correr(pruebas.carga(jsonb_build_array(pruebas.persona('Entrada General', 'Juan Pérez'))),
    'authenticated', :lucas), 'NEV:persona_sin_email');

select pruebas.igual('Lucas carga una venta en efectivo',
  pruebas.correr(pruebas.carga(jsonb_build_array(
    pruebas.persona('Entrada General', 'Juan Pérez', 'Juan@Example.com'),
    pruebas.persona('Entrada General', 'Sofía Gómez'),
    pruebas.persona('Entrada +25', 'Carlos Ruiz', 'carlos@example.com')),
    'efectivo_rrpp', '00000000-0000-0000-0000-0000000000e1'), 'authenticated', :lucas), 'ok');
select pruebas.igual('en efectivo queda aprobada al instante',
  (select status || ':' || total || ':' || origen from public.orders
   where idempotency_key = '00000000-0000-0000-0000-0000000000e1'), 'aprobado:50000:rrpp');
select pruebas.igual('se emite una entrada con QR por persona, a su nombre',
  (select string_agg(titular_nombre || '<' || titular_email || '>', ', ' order by titular_nombre)
   from public.tickets t join public.orders o on o.id = t.order_id
   where o.idempotency_key = '00000000-0000-0000-0000-0000000000e1'),
  'Carlos Ruiz<carlos@example.com>, Juan Pérez<juan@example.com>, Sofía Gómez<juan@example.com>');
select pruebas.igual('cada QR es un código largo y distinto',
  (select count(distinct qr_token) || ':' || min(char_length(qr_token)) from public.tickets t
   join public.orders o on o.id = t.order_id where o.idempotency_key = '00000000-0000-0000-0000-0000000000e1'),
  '3:64');
select pruebas.igual('la comisión es fija por entrada según el tipo',
  (select c.monto from public.commissions c join public.orders o on o.id = c.order_id
   where o.idempotency_key = '00000000-0000-0000-0000-0000000000e1'), 2000);
select pruebas.igual('el pago en efectivo queda registrado',
  (select p.medio || ':' || p.status || ':' || p.monto from public.payments p join public.orders o on o.id = p.order_id
   where o.idempotency_key = '00000000-0000-0000-0000-0000000000e1'), 'efectivo_rrpp:acreditado:50000');
select pruebas.igual('la venta queda en la auditoría',
  (select count(*) from public.audit_log where accion = 'venta_rrpp_cargada'), 1::bigint);
select pruebas.igual('reintentar la misma carga no la duplica',
  pruebas.correr_y_ver(pruebas.carga(jsonb_build_array(pruebas.persona('Entrada General', 'Juan Pérez', 'juan@example.com')),
    'efectivo_rrpp', '00000000-0000-0000-0000-0000000000e1'), 'authenticated', :lucas,
    $$select count(*) from public.orders where idempotency_key = '00000000-0000-0000-0000-0000000000e1'$$),
  'ok:1');
select pruebas.igual('otro RRPP no puede adueñarse de esa carga',
  pruebas.correr(pruebas.carga(jsonb_build_array(pruebas.persona('Entrada General', 'Juan Pérez', 'juan@example.com')),
    'efectivo_rrpp', '00000000-0000-0000-0000-0000000000e1'), 'authenticated', :martina), '23505');

select pruebas.igual('una transferencia queda por confirmar y sin entradas',
  pruebas.correr_y_ver(pruebas.carga(jsonb_build_array(pruebas.persona('Entrada General', 'Ana Díaz', 'ana.d@example.com')),
    'transferencia_rrpp', '00000000-0000-0000-0000-0000000000e2'), 'authenticated', :lucas,
    $$select o.status || ':' || (select count(*) from public.tickets t where t.order_id = o.id)
      from public.orders o where o.idempotency_key = '00000000-0000-0000-0000-0000000000e2'$$),
  'ok:por_confirmar:0');
select pruebas.igual('un medio de pago inventado se rechaza',
  pruebas.correr(pruebas.carga(jsonb_build_array(pruebas.persona('Entrada General', 'Ana Díaz', 'ana@example.com')),
    'regalo'), 'authenticated', :lucas), 'NEV:metodo_invalido');

select pruebas.igual('Lucas ve las entradas de lo que cargó',
  pruebas.cuenta('select * from public.tickets', 'authenticated', :lucas), 3::bigint);
select pruebas.igual('Martina no ve las entradas de Lucas',
  pruebas.cuenta('select * from public.tickets', 'authenticated', :martina), 0::bigint);
select pruebas.igual('nadie desde el navegador puede emitir entradas sueltas',
  pruebas.correr('select public.emitir_entradas(gen_random_uuid())', 'authenticated', :admin), '42501');

update public.sellers set puede_cargar_ventas = false where codigo = 'martina';
select pruebas.igual('un RRPP sin permiso de carga no puede cargar',
  pruebas.correr(pruebas.carga(jsonb_build_array(pruebas.persona('Entrada General', 'Ana Díaz', 'ana@example.com'))),
    'authenticated', :martina), 'NEV:no_carga_ventas');

-- ───────── Panel ─────────
insert into public.seller_settlements (seller_id, monto_efectivo, registrado_por)
select id, 30000, :admin from public.sellers where codigo = 'lucas';
select pruebas.igual('el panel de Lucas cuenta lo suyo',
  pruebas.valor($$select format('%s entradas, $%s, comisión %s, efectivo %s-%s, transferencia %s, por aprobar %s',
                 j ->> 'entradas', j ->> 'vendido', j ->> 'comision_generada',
                 j ->> 'cobrado_efectivo', j ->> 'rendido_efectivo', j ->> 'cobrado_transferencia',
                 j ->> 'por_aprobar')
                 from (select public.panel_rrpp() j) x$$, 'authenticated', :lucas),
  '3 entradas, $50000, comisión 2000, efectivo 50000-30000, transferencia 0, por aprobar 1');
select pruebas.igual('un RRPP sin aprobar no tiene panel',
  pruebas.valor('select public.panel_rrpp()::text', 'authenticated', :pendiente), null::text);
select pruebas.igual('el admin no ve un panel de RRPP ajeno',
  pruebas.valor('select public.panel_rrpp()::text', 'authenticated', :admin), null::text);
select pruebas.igual('el panel no se puede pedir sin sesión',
  pruebas.correr('select public.panel_rrpp()', 'anon'), '42501');

-- ───────── Ingreso con usuario ─────────
select pruebas.igual('el servidor encuentra el mail de un usuario',
  pruebas.valor($$select public.email_de_usuario(' Lucas ')$$, 'service_role'), 'lucas@example.com');
select pruebas.igual('el navegador no puede averiguar mails por usuario',
  pruebas.correr($$select public.email_de_usuario('lucas')$$, 'authenticated', :martina), '42501');
