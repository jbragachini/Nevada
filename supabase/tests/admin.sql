-- Pruebas de la etapa 4: funciones del admin. Corre después de invitaciones_y_rrpp.sql y usa sus
-- datos (evento en la página con ventas abiertas, venta en efectivo y transferencia por confirmar de
-- Lucas, rendición de $30.000).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

\set admin '\'a0000000-0000-0000-0000-00000000000a\''
\set lucas '\'a0000000-0000-0000-0000-00000000000b\''

-- Corre `sql` como admin.
create function pruebas.admin(sql text) returns text language sql as $$
  select pruebas.correr(sql, 'authenticated', 'a0000000-0000-0000-0000-00000000000a');
$$;
create function pruebas.admin_valor(consulta text) returns text language sql as $$
  select pruebas.valor(consulta, 'authenticated', 'a0000000-0000-0000-0000-00000000000a');
$$;
-- Valor de una consulta, leído recién cuando se llega a ella (después del cambio de la izquierda).
create function pruebas.q(consulta text) returns text language plpgsql as $$
declare
  v text;
begin
  execute consulta into v;
  return v;
end;
$$;

create function pruebas.evento() returns uuid language sql as $$
  select id from public.events where publicado;
$$;

-- ───────── Solo el admin ─────────
select pruebas.igual('un RRPP no puede usar funciones de admin',
  pruebas.correr($$select public.admin_crear_evento('{"nombre": "X", "fecha_inicio": "2027-01-01", "lugar": "Club"}')$$,
                 'authenticated', :lucas), 'NEV:sin_permiso');
select pruebas.igual('el público tampoco',
  pruebas.correr($$select public.admin_saldos_rrpp()$$, 'anon'), '42501');
-- Valor de `consulta` como admin con contraseña pero SIN la doble verificación (aal1).
create function pruebas.admin_sin_2fa(consulta text) returns text language plpgsql as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', 'a0000000-0000-0000-0000-00000000000a', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    execute consulta into v;
  exception when others then
    v := case when sqlerrm like 'NEV:%' then split_part(sqlerrm, ' ', 1) else sqlstate end;
  end;
  perform set_config('role', 'postgres', true);
  return v;
end;
$$;
select pruebas.igual('sin la doble verificación no es admin',
  pruebas.admin_sin_2fa('select public.es_admin()::text'), 'false');
select pruebas.igual('sin la doble verificación no ve pedidos',
  pruebas.admin_sin_2fa('select count(*)::text from public.orders'), '0');
select pruebas.igual('sin la doble verificación no puede aprobar ni editar',
  pruebas.admin_sin_2fa($$select public.admin_saldos_rrpp()::text$$), 'NEV:sin_permiso');
select pruebas.igual('nadie desde el navegador puede escribir la auditoría a mano',
  pruebas.correr($$select public.auditar('x', 'y', null, null, null)$$, 'authenticated', :admin), '42501');

-- ───────── Eventos ─────────
create temp table ev as
select pruebas.admin_valor($$select public.admin_crear_evento(
  '{"nombre": "Fin de Año Nevada", "subtitulo": "DJ invitado", "fecha_inicio": "2026-12-31T23:00:00-03:00",
    "lugar": "Club Social", "ciudad": "Oncativo, Córdoba"}')::text$$)::uuid as id;
select pruebas.igual('crear un evento lo deja como borrador con General y +25',
  (select e.publicado || ':' || e.ventas_abiertas || ':' || (select string_agg(t.nombre, ',' order by t.orden) from public.ticket_types t where t.event_id = e.id)
   from public.events e where e.id = (select id from ev)),
  'false:false:Entrada General,Entrada +25');
select pruebas.igual('queda en la auditoría con quién lo creó',
  (select count(*) from public.audit_log where accion = 'evento_creado' and actor_id = :admin), 1::bigint);

select pruebas.igual('con palabra clave hace falta la palabra',
  pruebas.admin(format($$select public.admin_editar_evento(%L, '{"acceso": "clave"}')$$, (select id from ev))),
  '23514');
select pruebas.igual('se edita acceso, clave y «¿Quién te vendió?»',
  pruebas.admin(format($$select public.admin_editar_evento(%L,
    '{"acceso": "clave", "clave_acceso": "Año Nuevo", "mostrar_rrpp": false, "lugar": "Club Social Oncativo"}')$$,
    (select id from ev))) || ':' || pruebas.q($q$select acceso || '|' || clave_acceso || '|' || mostrar_rrpp || '|' || lugar from public.events where id = (select id from ev)$q$),
  'ok:clave|Año Nuevo|false|Club Social Oncativo');
select pruebas.igual('la portada empieza en A y se cambia a C',
  pruebas.q($q$select portada from public.events where id = (select id from ev)$q$) || ':' ||
  pruebas.admin(format($$select public.admin_editar_evento(%L, '{"portada": "c"}')$$, (select id from ev))) || ':' ||
  pruebas.q($q$select portada from public.events where id = (select id from ev)$q$),
  'a:ok:c');
select pruebas.igual('solo hay portadas A y C',
  pruebas.admin(format($$select public.admin_editar_evento(%L, '{"portada": "b"}')$$, (select id from ev))),
  '23514');

select pruebas.igual('poner un evento en la página saca al anterior',
  pruebas.admin(format($$select public.admin_estado_evento(%L, true, true)$$, (select id from ev))) || ':' || pruebas.q($q$select nombre from public.storefront_event$q$) || ':' || pruebas.q($q$select count(*) from public.events where publicado$q$),
  'ok:Fin de Año Nevada:1');
select pruebas.igual('la página pública ve qué portada usar',
  pruebas.valor($$select portada from public.storefront_event$$, 'anon'), 'c');
select pruebas.igual('y se puede volver a poner el original',
  pruebas.admin(format($$select public.admin_estado_evento(%L, true, null)$$,
    (select id from public.events where nombre = 'Navidad con Nevada 2026'))) || ':' || pruebas.q($q$select nombre from public.storefront_event$q$),
  'ok:Navidad con Nevada 2026');
select pruebas.igual('cerrar ventas sin tocar si está en la página',
  pruebas.admin(format($$select public.admin_estado_evento(%L, null, false)$$, (select id from ev))) || ':' || pruebas.q($q$select publicado || '|' || ventas_abiertas from public.events where id = (select id from ev)$q$),
  'ok:false|false');

create temp table dup as
select pruebas.admin_valor(format($$select public.admin_duplicar_evento(%L)::text$$, (select id from ev)))::uuid as id;
select pruebas.igual('duplicar copia datos y tipos, como borrador',
  (select e.nombre || ':' || e.publicado || ':' || (select count(*) from public.ticket_types t where t.event_id = e.id)
          || ':' || e.portada
   from public.events e where e.id = (select id from dup)),
  'Fin de Año Nevada (copia):false:2:c');
select pruebas.igual('un evento sin ventas se puede eliminar',
  pruebas.admin(format($$select public.admin_eliminar_evento(%L)$$, (select id from dup))) || ':' || pruebas.q($q$select count(*) from public.events where id = (select id from dup)$q$), 'ok:0');
select pruebas.igual('un evento con ventas no se elimina',
  pruebas.admin(format($$select public.admin_eliminar_evento(%L)$$, pruebas.evento())), 'NEV:evento_con_ventas');

-- ───────── Tipos ─────────
create temp table tipo as
select pruebas.admin_valor(format($$select public.admin_guardar_tipo(null, %L,
  '{"nombre": "VIP Mesa", "precio": 80000, "cupo_total": 10, "comision_rrpp": 5000}')::text$$, pruebas.evento()))::uuid as id;
select pruebas.igual('se agrega un tipo nuevo con su comisión',
  (select nombre || ':' || precio || ':' || comision_rrpp || ':' || en_venta from public.ticket_types where id = (select id from tipo)),
  'VIP Mesa:80000:5000:true');
select pruebas.igual('se cambian precio y comisión',
  pruebas.admin(format($$select public.admin_guardar_tipo(%L, null, '{"precio": 90000, "comision_rrpp": 6000}')$$,
                       (select id from tipo))) || ':' || pruebas.q($q$select precio || '|' || comision_rrpp from public.ticket_types where id = (select id from tipo)$q$),
  'ok:90000|6000');
select pruebas.igual('el cupo no baja de lo vendido',
  pruebas.admin(format($$select public.admin_guardar_tipo(%L, null, '{"cupo_total": 1}')$$,
                       pruebas.tipo('Entrada General'))), 'NEV:cupo_menor_que_vendido');
select pruebas.igual('un tipo sin ventas se borra',
  pruebas.admin_valor(format($$select public.admin_borrar_tipo(%L)$$, (select id from tipo))), 'borrado');
select pruebas.igual('un tipo con ventas pasa a «no a la venta»',
  pruebas.admin_valor(format($$select public.admin_borrar_tipo(%L)$$, pruebas.tipo('Entrada +25'))) || ':' || pruebas.q($q$select en_venta from public.ticket_types where nombre = 'Entrada +25' and event_id = pruebas.evento()$q$),
  'sin_venta:false');
select pruebas.admin(format($$select public.admin_guardar_tipo(%L, null, '{"en_venta": true}')$$, pruebas.tipo('Entrada +25')));

-- ───────── Aprobar y rechazar ─────────
select pruebas.igual('una compra web sin pagar no se puede aprobar',
  pruebas.admin(format($$select public.admin_aprobar_pedido(%L)$$,
    (select id from public.orders where status = 'pendiente_pago' order by creado_en limit 1))),
  'NEV:estado_invalido');

create temp table transf as
select id from public.orders where idempotency_key = '00000000-0000-0000-0000-0000000000e2';
select pruebas.igual('aprobar una transferencia emite sus entradas',
  pruebas.admin_valor(format($$select public.admin_aprobar_pedido(%L)::text$$, (select id from transf))) || ':' || pruebas.q($q$select o.status || '|' || p.status || '|' || (select count(*) from public.commissions c where c.order_id = o.id)
   from public.orders o join public.payments p on p.order_id = o.id where o.id = (select id from transf)$q$),
  '1:aprobado|acreditado|1');
select pruebas.igual('aprobar dos veces no emite de nuevo',
  pruebas.admin(format($$select public.admin_aprobar_pedido(%L)$$, (select id from transf))) || ':' || pruebas.q($q$select count(*) from public.tickets where order_id = (select id from transf)$q$),
  'NEV:estado_invalido:1');

-- Compra web que Mercado Pago marcó pagada (etapa 5): una entrada por unidad a nombre del comprador.
update public.orders set status = 'pagado'
where comprador_email = 'd@example.com';
select pruebas.igual('aprobar una compra web pagada emite una entrada por unidad',
  pruebas.admin_valor(format($$select public.admin_aprobar_pedido(%L)::text$$,
    (select id from public.orders where comprador_email = 'd@example.com'))) || ':' || pruebas.q($q$select string_agg(t.titular_nombre, ',') from public.tickets t join public.orders o on o.id = t.order_id
   where o.comprador_email = 'd@example.com'$q$),
  '1:Ana Pérez');

update public.orders set status = 'pagado', vence_en = now() + interval '1 hour'
where comprador_email = 'clave1@example.com';
create temp table antes as
select ocupadas from public.ticket_type_ocupacion where ticket_type_id = pruebas.tipo('Entrada General');
select pruebas.admin(format($$select public.admin_rechazar_pedido(%L, 'Pago duplicado')$$,
  (select id from public.orders where comprador_email = 'clave1@example.com')));
select pruebas.igual('rechazar libera el cupo',
  (select ocupadas from antes) -
  (select ocupadas from public.ticket_type_ocupacion where ticket_type_id = pruebas.tipo('Entrada General')), 1);
select pruebas.igual('el rechazo queda con su motivo',
  (select status || ':' || motivo_rechazo from public.orders where comprador_email = 'clave1@example.com'),
  'rechazado:Pago duplicado');

-- ───────── Entradas ─────────
create temp table ent as select id from public.tickets where titular_nombre = 'Carlos Ruiz';
select pruebas.igual('anular una entrada',
  pruebas.admin(format($$select public.admin_anular_entrada(%L, 'Pidió la devolución')$$, (select id from ent))) || ':' || pruebas.q($q$select status from public.tickets where id = (select id from ent)$q$), 'ok:anulada');
select pruebas.igual('no se anula dos veces',
  pruebas.admin(format($$select public.admin_anular_entrada(%L, 'x')$$, (select id from ent))), 'NEV:estado_invalido');

-- ───────── Accesos y RRPP ─────────
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000e5', 'nuevo@example.com');
insert into public.profiles (id, nombre, usuario, rol, activo)
values ('a0000000-0000-0000-0000-0000000000e5', 'Nuevo RRPP', 'nuevo', 'rrpp', false);
insert into public.access_requests (profile_id, whatsapp) values ('a0000000-0000-0000-0000-0000000000e5', '3510000000');
select pruebas.igual('un código de link repetido no se acepta',
  pruebas.admin(format($$select public.admin_aprobar_acceso(%L, 'lucas', true, null)$$,
    (select id from public.access_requests where profile_id = 'a0000000-0000-0000-0000-0000000000e5'))),
  '23505');
select pruebas.igual('aprobar un acceso activa al usuario y crea su ficha de RRPP',
  pruebas.admin(format($$select public.admin_aprobar_acceso(%L, 'Nuevo', false, 5)$$,
    (select id from public.access_requests where profile_id = 'a0000000-0000-0000-0000-0000000000e5'))) || ':' || pruebas.q($q$select p.activo || '|' || s.codigo || '|' || s.puede_cargar_ventas || '|' || s.max_invitados || '|' || r.estado
   from public.profiles p join public.sellers s on s.profile_id = p.id join public.access_requests r on r.profile_id = p.id
   where p.usuario = 'nuevo'$q$),
  'ok:true|nuevo|false|5|aprobada');
select pruebas.igual('ya aprobado no se vuelve a aprobar',
  pruebas.admin(format($$select public.admin_aprobar_acceso(%L, 'otro', true, null)$$,
    (select id from public.access_requests where profile_id = 'a0000000-0000-0000-0000-0000000000e5'))),
  'NEV:estado_invalido');

select pruebas.igual('desactivar un RRPP le corta el acceso y lo saca de la página',
  pruebas.admin(format($$select public.admin_editar_rrpp(%L, '{"activo": false}')$$,
    (select id from public.sellers where codigo = 'lucas'))) || ':' || pruebas.q($q$select count(*) from public.storefront_sellers where codigo = 'lucas'$q$) || ':' ||
  coalesce(pruebas.valor('select public.panel_rrpp()::text', 'authenticated', :lucas), 'sin panel'),
  'ok:0:sin panel');
select pruebas.admin(format($$select public.admin_editar_rrpp(%L, '{"activo": true, "max_invitados": null}')$$,
  (select id from public.sellers where codigo = 'lucas')));
select pruebas.igual('reactivado vuelve a tener panel y sin tope',
  (pruebas.valor('select public.panel_rrpp()::text', 'authenticated', :lucas) is not null) || ':' ||
  coalesce((select max_invitados::text from public.sellers where codigo = 'lucas'), 'sin tope'),
  'true:sin tope');

-- ───────── Comisiones y rendiciones ─────────
create function pruebas.saldo_lucas() returns text language sql as $$
  select pruebas.admin_valor($q$select format('generada %s, pagada %s, efectivo %s-%s, transferencia %s-%s',
           comision_generada, comision_pagada, cobrado_efectivo, rendido_efectivo,
           cobrado_transferencia, rendido_transferencia)
         from public.admin_saldos_rrpp() where codigo = 'lucas'$q$);
$$;
select pruebas.igual('saldos de Lucas',
  pruebas.saldo_lucas(), 'generada 3000, pagada 0, efectivo 50000-30000, transferencia 15000-0');
select pruebas.igual('no se paga más comisión que la pendiente',
  pruebas.admin(format($$select public.admin_pagar_comision(%L, 5000, 'transferencia', null)$$,
    (select id from public.sellers where codigo = 'lucas'))), 'NEV:supera_pendiente');
select pruebas.igual('se paga parte de la comisión',
  pruebas.admin(format($$select public.admin_pagar_comision(%L, 2000, 'efectivo', 'Primera parte')$$,
    (select id from public.sellers where codigo = 'lucas'))) || ':' || pruebas.saldo_lucas(),
  'ok:generada 3000, pagada 2000, efectivo 50000-30000, transferencia 15000-0');
select pruebas.igual('el RRPP ve en su panel lo que ya cobró',
  pruebas.valor($$select (public.panel_rrpp() ->> 'comision_cobrada')$$, 'authenticated', :lucas), '2000');
select pruebas.igual('no se registra más rendición de la que debe',
  pruebas.admin(format($$select public.admin_registrar_rendicion(%L, 30000, 0, null)$$,
    (select id from public.sellers where codigo = 'lucas'))), 'NEV:supera_deuda');
select pruebas.igual('se registra la rendición por medio',
  pruebas.admin(format($$select public.admin_registrar_rendicion(%L, 20000, 15000, 'Saldo final')$$,
    (select id from public.sellers where codigo = 'lucas'))) || ':' || pruebas.saldo_lucas(),
  'ok:generada 3000, pagada 2000, efectivo 50000-50000, transferencia 15000-15000');
select pruebas.igual('una rendición en cero no se registra',
  pruebas.admin(format($$select public.admin_registrar_rendicion(%L, 0, 0, null)$$,
    (select id from public.sellers where codigo = 'lucas'))), 'NEV:monto_invalido');

-- ───────── Resumen y auditoría ─────────
select pruebas.igual('el resumen del evento cuenta lo aprobado',
  pruebas.admin_valor(format($$select (j ->> 'recaudado') || ':' || jsonb_array_length(j -> 'tipos') || ':' ||
                                      (j -> 'ranking' -> 0 ->> 'nombre')
                               from (select public.admin_resumen_evento(%L) j) x$$, pruebas.evento())),
  '80000:3:Lucas');
select pruebas.igual('cada cambio del admin queda en la auditoría',
  (select count(distinct accion) from public.audit_log where actor_id = :admin) >= 12, true);
select pruebas.igual('un RRPP no lee la auditoría',
  pruebas.cuenta('select * from public.audit_log', 'authenticated', :lucas), 0::bigint);
