-- Nevada Producciones
-- 0008: panel del admin (etapa 4).
--
-- Todo cambio del admin pasa por estas funciones: cada una verifica que quien llama sea admin,
-- aplica las reglas del negocio y deja el cambio en la auditoría (quién, cuándo, antes y después).
-- Por eso el navegador ya no escribe directo en eventos, tipos, RRPP, perfiles ni accesos.
-- Los errores salen con el prefijo NEV: y un código que el servidor traduce.

-- ─────────────────────────────────────────────────────────────
-- Ayudantes internos
-- ─────────────────────────────────────────────────────────────
create or replace function public.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'NEV:sin_permiso';
  end if;
end;
$$;

create or replace function public.auditar(p_accion text, p_entidad text, p_id text, p_antes jsonb, p_despues jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), p_accion, p_entidad, p_id, p_antes, p_despues);
$$;

revoke execute on function public.exigir_admin() from public, anon;
revoke execute on function public.auditar(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- El navegador ya no escribe directo: solo con las funciones de abajo.
revoke insert, update, delete, truncate on
  public.events, public.ticket_types, public.sellers, public.profiles, public.access_requests
  from authenticated;

-- ─────────────────────────────────────────────────────────────
-- Eventos
-- ─────────────────────────────────────────────────────────────

-- Crea un evento como borrador (fuera de la página, ventas cerradas) con General y +25.
create or replace function public.admin_crear_evento(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_admin();
  insert into public.events (nombre, subtitulo, fecha_inicio, lugar, direccion, ciudad, descripcion,
                             creado_por, actualizado_por)
  values (btrim(p ->> 'nombre'), nullif(btrim(p ->> 'subtitulo'), ''), (p ->> 'fecha_inicio')::timestamptz,
          btrim(p ->> 'lugar'), nullif(btrim(p ->> 'direccion'), ''),
          coalesce(nullif(btrim(p ->> 'ciudad'), ''), 'Oncativo, Córdoba'),
          nullif(btrim(p ->> 'descripcion'), ''), auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, orden) values
    (v_id, 'Entrada General', 'Acceso general al evento', 15000, 400, 1),
    (v_id, 'Entrada +25', 'Acceso para mayores de 25', 20000, 200, 2);

  perform public.auditar('evento_creado', 'events', v_id::text, null,
                         (select to_jsonb(e) from public.events e where e.id = v_id));
  return v_id;
end;
$$;

-- Edita los datos del evento. Solo cambia las claves que vienen en p.
create or replace function public.admin_editar_evento(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(e) into v_antes from public.events e where e.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;

  update public.events e set
    nombre       = case when p ? 'nombre' then btrim(p ->> 'nombre') else e.nombre end,
    subtitulo    = case when p ? 'subtitulo' then nullif(btrim(p ->> 'subtitulo'), '') else e.subtitulo end,
    fecha_inicio = case when p ? 'fecha_inicio' then (p ->> 'fecha_inicio')::timestamptz else e.fecha_inicio end,
    lugar        = case when p ? 'lugar' then btrim(p ->> 'lugar') else e.lugar end,
    direccion    = case when p ? 'direccion' then nullif(btrim(p ->> 'direccion'), '') else e.direccion end,
    ciudad       = case when p ? 'ciudad' then btrim(p ->> 'ciudad') else e.ciudad end,
    descripcion  = case when p ? 'descripcion' then nullif(btrim(p ->> 'descripcion'), '') else e.descripcion end,
    acceso       = case when p ? 'acceso' then p ->> 'acceso' else e.acceso end,
    clave_acceso = case when p ? 'clave_acceso' then nullif(btrim(p ->> 'clave_acceso'), '') else e.clave_acceso end,
    mostrar_rrpp = case when p ? 'mostrar_rrpp' then (p ->> 'mostrar_rrpp')::boolean else e.mostrar_rrpp end,
    actualizado_por = auth.uid()
  where e.id = p_id;

  perform public.auditar('evento_editado', 'events', p_id::text, v_antes,
                         (select to_jsonb(e) from public.events e where e.id = p_id));
end;
$$;

-- Pone o saca el evento de la página (poner uno saca al anterior) y abre o cierra sus ventas.
create or replace function public.admin_estado_evento(p_id uuid, p_publicado boolean, p_ventas_abiertas boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(e) into v_antes from public.events e where e.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;

  if p_publicado then
    update public.events e set publicado = false, actualizado_por = auth.uid()
    where e.publicado and e.id <> p_id;
  end if;
  update public.events e set
    publicado = coalesce(p_publicado, e.publicado),
    ventas_abiertas = coalesce(p_ventas_abiertas, e.ventas_abiertas),
    actualizado_por = auth.uid()
  where e.id = p_id;

  perform public.auditar('evento_estado', 'events', p_id::text,
                         jsonb_build_object('publicado', v_antes -> 'publicado', 'ventas_abiertas', v_antes -> 'ventas_abiertas'),
                         (select jsonb_build_object('publicado', e.publicado, 'ventas_abiertas', e.ventas_abiertas)
                          from public.events e where e.id = p_id));
end;
$$;

-- Copia un evento con sus tipos, como borrador.
create or replace function public.admin_duplicar_evento(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_admin();
  insert into public.events (nombre, subtitulo, fecha_inicio, lugar, direccion, ciudad, descripcion, flyer_path,
                             acceso, clave_acceso, mostrar_rrpp, creado_por, actualizado_por)
  select left(e.nombre, 110) || ' (copia)', e.subtitulo, e.fecha_inicio, e.lugar, e.direccion, e.ciudad,
         e.descripcion, e.flyer_path, e.acceso, e.clave_acceso, e.mostrar_rrpp, auth.uid(), auth.uid()
  from public.events e where e.id = p_id
  returning id into v_id;
  if v_id is null then
    raise exception 'NEV:no_existe';
  end if;

  insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, comision_rrpp,
                                   max_por_compra, en_venta, orden)
  select v_id, t.nombre, t.descripcion, t.precio, t.cupo_total, t.comision_rrpp, t.max_por_compra, t.en_venta, t.orden
  from public.ticket_types t where t.event_id = p_id;

  perform public.auditar('evento_duplicado', 'events', v_id::text, jsonb_build_object('origen', p_id), null);
  return v_id;
end;
$$;

-- Elimina un evento solo si no tiene ventas.
create or replace function public.admin_eliminar_evento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(e) into v_antes from public.events e where e.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;
  if exists (select 1 from public.orders o where o.event_id = p_id) then
    raise exception 'NEV:evento_con_ventas';
  end if;
  delete from public.events e where e.id = p_id;
  perform public.auditar('evento_eliminado', 'events', p_id::text, v_antes, null);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Tipos de entrada
-- ─────────────────────────────────────────────────────────────

-- Crea (p_id null) o edita un tipo. El cupo no puede bajar de lo vendido (trigger de 0005).
create or replace function public.admin_guardar_tipo(p_id uuid, p_event_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_antes jsonb;
begin
  perform public.exigir_admin();
  if v_id is null then
    insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, comision_rrpp,
                                     max_por_compra, en_venta, orden)
    values (p_event_id, btrim(p ->> 'nombre'), nullif(btrim(p ->> 'descripcion'), ''),
            (p ->> 'precio')::integer, (p ->> 'cupo_total')::integer,
            coalesce((p ->> 'comision_rrpp')::integer, 0), coalesce((p ->> 'max_por_compra')::integer, 10),
            coalesce((p ->> 'en_venta')::boolean, true),
            coalesce((p ->> 'orden')::integer,
                     (select coalesce(max(t.orden), 0) + 1 from public.ticket_types t where t.event_id = p_event_id)))
    returning id into v_id;
  else
    select to_jsonb(t) into v_antes from public.ticket_types t where t.id = v_id for update;
    if v_antes is null then
      raise exception 'NEV:no_existe';
    end if;
    update public.ticket_types t set
      nombre         = case when p ? 'nombre' then btrim(p ->> 'nombre') else t.nombre end,
      descripcion    = case when p ? 'descripcion' then nullif(btrim(p ->> 'descripcion'), '') else t.descripcion end,
      precio         = case when p ? 'precio' then (p ->> 'precio')::integer else t.precio end,
      cupo_total     = case when p ? 'cupo_total' then (p ->> 'cupo_total')::integer else t.cupo_total end,
      comision_rrpp  = case when p ? 'comision_rrpp' then (p ->> 'comision_rrpp')::integer else t.comision_rrpp end,
      max_por_compra = case when p ? 'max_por_compra' then (p ->> 'max_por_compra')::integer else t.max_por_compra end,
      en_venta       = case when p ? 'en_venta' then (p ->> 'en_venta')::boolean else t.en_venta end,
      orden          = case when p ? 'orden' then (p ->> 'orden')::integer else t.orden end
    where t.id = v_id;
  end if;

  perform public.auditar(case when p_id is null then 'tipo_creado' else 'tipo_editado' end,
                         'ticket_types', v_id::text, v_antes,
                         (select to_jsonb(t) from public.ticket_types t where t.id = v_id));
  return v_id;
end;
$$;

-- Borra un tipo sin ventas. Si tiene ventas no se borra: se pasa a «no a la venta».
create or replace function public.admin_borrar_tipo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(t) into v_antes from public.ticket_types t where t.id = p_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;
  if exists (select 1 from public.order_items i where i.ticket_type_id = p_id) then
    update public.ticket_types t set en_venta = false where t.id = p_id;
    perform public.auditar('tipo_sin_venta', 'ticket_types', p_id::text, v_antes, null);
    return 'sin_venta';
  end if;
  delete from public.ticket_types t where t.id = p_id;
  perform public.auditar('tipo_borrado', 'ticket_types', p_id::text, v_antes, null);
  return 'borrado';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Pedidos y entradas
-- ─────────────────────────────────────────────────────────────

-- Aprueba un pedido pagado (Mercado Pago confirmado) o una transferencia por confirmar:
-- emite las entradas con QR y la comisión del RRPP. Devuelve cuántas entradas emitió.
create or replace function public.admin_aprobar_pedido(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_emitidas integer;
begin
  perform public.exigir_admin();
  select * into v_order from public.orders o where o.id = p_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_order.status not in ('pagado', 'por_confirmar') then
    raise exception 'NEV:estado_invalido' using detail = v_order.status;
  end if;

  update public.orders o set status = 'aprobado', revisado_por = auth.uid(), revisado_en = now()
  where o.id = p_id;
  -- La transferencia confirmada por el admin queda acreditada (Mercado Pago ya viene acreditado).
  update public.payments p set status = 'acreditado', revisado_por = auth.uid(), revisado_en = now()
  where p.order_id = p_id and p.status = 'pendiente';

  v_emitidas := public.emitir_entradas(p_id);
  perform public.auditar('pedido_aprobado', 'orders', p_id::text,
                         jsonb_build_object('status', v_order.status),
                         jsonb_build_object('status', 'aprobado', 'numero', v_order.numero, 'entradas', v_emitidas));
  return v_emitidas;
end;
$$;

-- Rechaza un pedido que esperaba aprobación: libera el cupo.
-- (Un pago de Mercado Pago rechazado se devuelve desde Mercado Pago; etapa 5.)
create or replace function public.admin_rechazar_pedido(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform public.exigir_admin();
  select * into v_order from public.orders o where o.id = p_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_order.status not in ('pagado', 'por_confirmar') then
    raise exception 'NEV:estado_invalido' using detail = v_order.status;
  end if;

  update public.orders o set status = 'rechazado', revisado_por = auth.uid(), revisado_en = now(),
                             motivo_rechazo = nullif(btrim(p_motivo), '')
  where o.id = p_id;
  update public.payments p set status = 'rechazado', revisado_por = auth.uid(), revisado_en = now(),
                               motivo_rechazo = nullif(btrim(p_motivo), '')
  where p.order_id = p_id and p.status in ('pendiente', 'iniciado');

  perform public.auditar('pedido_rechazado', 'orders', p_id::text,
                         jsonb_build_object('status', v_order.status),
                         jsonb_build_object('status', 'rechazado', 'numero', v_order.numero, 'motivo', p_motivo));
end;
$$;

-- Anula una entrada válida (deja de servir en la puerta).
create or replace function public.admin_anular_entrada(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  perform public.exigir_admin();
  select t.status into v_status from public.tickets t where t.id = p_id for update;
  if v_status is null then
    raise exception 'NEV:no_existe';
  end if;
  if v_status <> 'valida' then
    raise exception 'NEV:estado_invalido' using detail = v_status;
  end if;
  update public.tickets t set status = 'anulada', anulado_por = auth.uid(), anulado_en = now() where t.id = p_id;
  perform public.auditar('entrada_anulada', 'tickets', p_id::text, jsonb_build_object('status', v_status),
                         jsonb_build_object('status', 'anulada', 'motivo', p_motivo));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RRPP y accesos
-- ─────────────────────────────────────────────────────────────

-- Aprueba un pedido de acceso: activa el perfil y crea (o reactiva) su ficha de vendedor.
create or replace function public.admin_aprobar_acceso(p_request_id uuid, p_codigo text,
                                                       p_puede_cargar boolean, p_max_invitados integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.access_requests%rowtype;
  v_perfil public.profiles%rowtype;
  v_seller uuid;
begin
  perform public.exigir_admin();
  select * into v_req from public.access_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_req.estado <> 'pendiente' then
    raise exception 'NEV:estado_invalido' using detail = v_req.estado;
  end if;
  select * into v_perfil from public.profiles p where p.id = v_req.profile_id for update;

  update public.profiles p set activo = true where p.id = v_req.profile_id;
  update public.access_requests r set estado = 'aprobada', revisado_por = auth.uid(), revisado_en = now()
  where r.id = p_request_id;

  insert into public.sellers (profile_id, nombre_publico, codigo, puede_cargar_ventas, max_invitados, activo)
  values (v_req.profile_id, v_perfil.nombre, lower(btrim(p_codigo)), coalesce(p_puede_cargar, true),
          p_max_invitados, true)
  on conflict (profile_id) do update
    set activo = true, puede_cargar_ventas = excluded.puede_cargar_ventas, max_invitados = excluded.max_invitados
  returning id into v_seller;

  perform public.auditar('acceso_aprobado', 'access_requests', p_request_id::text, null,
                         jsonb_build_object('usuario', v_perfil.usuario, 'codigo', lower(btrim(p_codigo))));
  return v_seller;
end;
$$;

create or replace function public.admin_rechazar_acceso(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  update public.access_requests r set estado = 'rechazada', revisado_por = auth.uid(), revisado_en = now()
  where r.id = p_request_id and r.estado = 'pendiente';
  if not found then
    raise exception 'NEV:estado_invalido';
  end if;
  perform public.auditar('acceso_rechazado', 'access_requests', p_request_id::text, null, null);
end;
$$;

-- Edita un RRPP: activo (también su usuario), carga de ventas, tope de invitados, nombre y código.
-- Desactivarlo le corta el acceso al instante y lo saca de «¿Quién te vendió?».
create or replace function public.admin_editar_rrpp(p_seller_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_profile uuid;
begin
  perform public.exigir_admin();
  select to_jsonb(s), s.profile_id into v_antes, v_profile from public.sellers s where s.id = p_seller_id for update;
  if v_antes is null then
    raise exception 'NEV:no_existe';
  end if;

  update public.sellers s set
    activo              = case when p ? 'activo' then (p ->> 'activo')::boolean else s.activo end,
    puede_cargar_ventas = case when p ? 'puede_cargar_ventas' then (p ->> 'puede_cargar_ventas')::boolean
                               else s.puede_cargar_ventas end,
    max_invitados       = case when p ? 'max_invitados' then (p ->> 'max_invitados')::integer else s.max_invitados end,
    nombre_publico      = case when p ? 'nombre_publico' then btrim(p ->> 'nombre_publico') else s.nombre_publico end,
    codigo              = case when p ? 'codigo' then lower(btrim(p ->> 'codigo')) else s.codigo end
  where s.id = p_seller_id;

  if p ? 'activo' and v_profile is not null then
    update public.profiles pr set activo = (p ->> 'activo')::boolean where pr.id = v_profile and pr.rol = 'rrpp';
  end if;

  perform public.auditar('rrpp_editado', 'sellers', p_seller_id::text, v_antes,
                         (select to_jsonb(s) from public.sellers s where s.id = p_seller_id));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Plata con los RRPP
-- ─────────────────────────────────────────────────────────────

-- Saldos de todos los RRPP: comisiones y lo que tienen que rendir.
create or replace function public.admin_saldos_rrpp()
returns table (
  seller_id uuid, nombre text, codigo text, activo boolean, usuario text,
  entradas integer, vendido integer,
  comision_generada integer, comision_pagada integer,
  cobrado_efectivo integer, cobrado_transferencia integer,
  rendido_efectivo integer, rendido_transferencia integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
  select s.id, s.nombre_publico, s.codigo, s.activo, p.usuario,
    coalesce((select sum(i.cantidad) from public.order_items i join public.orders o on o.id = i.order_id
              where o.seller_id = s.id and o.status = 'aprobado'), 0)::integer,
    coalesce((select sum(o.total) from public.orders o where o.seller_id = s.id and o.status = 'aprobado'), 0)::integer,
    coalesce((select sum(c.monto) from public.commissions c where c.seller_id = s.id and c.status <> 'anulada'), 0)::integer,
    coalesce((select sum(x.monto) from public.commission_payouts x where x.seller_id = s.id), 0)::integer,
    coalesce((select sum(o.total) from public.orders o
              where o.seller_id = s.id and o.status = 'aprobado' and o.metodo_pago = 'efectivo_rrpp'), 0)::integer,
    coalesce((select sum(o.total) from public.orders o
              where o.seller_id = s.id and o.status = 'aprobado' and o.metodo_pago = 'transferencia_rrpp'), 0)::integer,
    coalesce((select sum(r.monto_efectivo) from public.seller_settlements r where r.seller_id = s.id), 0)::integer,
    coalesce((select sum(r.monto_transferencia) from public.seller_settlements r where r.seller_id = s.id), 0)::integer
  from public.sellers s
  left join public.profiles p on p.id = s.profile_id
  order by s.nombre_publico;
end;
$$;

-- Registra un pago de comisión (no puede pasar lo pendiente).
create or replace function public.admin_pagar_comision(p_seller_id uuid, p_monto integer, p_medio text, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendiente integer;
begin
  perform public.exigir_admin();
  perform 1 from public.sellers s where s.id = p_seller_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  select x.comision_generada - x.comision_pagada into v_pendiente
  from public.admin_saldos_rrpp() x where x.seller_id = p_seller_id;
  if p_monto is null or p_monto <= 0 then
    raise exception 'NEV:monto_invalido';
  end if;
  if p_monto > v_pendiente then
    raise exception 'NEV:supera_pendiente' using detail = v_pendiente::text;
  end if;
  insert into public.commission_payouts (seller_id, monto, medio, nota, registrado_por)
  values (p_seller_id, p_monto, p_medio, nullif(btrim(p_nota), ''), auth.uid());
  perform public.auditar('comision_pagada', 'sellers', p_seller_id::text, null,
                         jsonb_build_object('monto', p_monto, 'medio', p_medio));
end;
$$;

-- Registra lo que el RRPP rindió, por medio (no puede pasar lo que debe en cada uno).
create or replace function public.admin_registrar_rendicion(p_seller_id uuid, p_efectivo integer,
                                                            p_transferencia integer, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  perform public.exigir_admin();
  perform 1 from public.sellers s where s.id = p_seller_id for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  select * into v from public.admin_saldos_rrpp() x where x.seller_id = p_seller_id;
  if coalesce(p_efectivo, 0) < 0 or coalesce(p_transferencia, 0) < 0
     or coalesce(p_efectivo, 0) + coalesce(p_transferencia, 0) = 0 then
    raise exception 'NEV:monto_invalido';
  end if;
  if coalesce(p_efectivo, 0) > v.cobrado_efectivo - v.rendido_efectivo then
    raise exception 'NEV:supera_deuda' using detail = 'efectivo';
  end if;
  if coalesce(p_transferencia, 0) > v.cobrado_transferencia - v.rendido_transferencia then
    raise exception 'NEV:supera_deuda' using detail = 'transferencia';
  end if;
  insert into public.seller_settlements (seller_id, monto_efectivo, monto_transferencia, nota, registrado_por)
  values (p_seller_id, coalesce(p_efectivo, 0), coalesce(p_transferencia, 0), nullif(btrim(p_nota), ''), auth.uid());
  perform public.auditar('rendicion_registrada', 'sellers', p_seller_id::text, null,
                         jsonb_build_object('efectivo', p_efectivo, 'transferencia', p_transferencia));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Resumen de un evento
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_resumen_evento(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'tipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre, 'precio', t.precio, 'cupo', t.cupo_total, 'en_venta', t.en_venta,
        'vendidas', coalesce((select sum(i.cantidad) from public.order_items i join public.orders o on o.id = i.order_id
                              where i.ticket_type_id = t.id and o.status = 'aprobado'), 0),
        'ocupadas', oc.ocupadas) order by t.orden, t.nombre)
      from public.ticket_types t join public.ticket_type_ocupacion oc on oc.ticket_type_id = t.id
      where t.event_id = p_event_id), '[]'::jsonb),
    'recaudado', (select coalesce(sum(o.total), 0) from public.orders o
                  where o.event_id = p_event_id and o.status = 'aprobado'),
    'por_aprobar', (select count(*) from public.orders o
                    where o.event_id = p_event_id and o.status in ('pagado', 'por_confirmar')),
    'esperando_pago', (select count(*) from public.orders o
                       where o.event_id = p_event_id and o.status = 'pendiente_pago' and o.vence_en > now()),
    'ingresos', (select count(*) from public.checkins c join public.tickets k on k.id = c.ticket_id
                 join public.orders o on o.id = k.order_id where o.event_id = p_event_id),
    'ranking', coalesce((
      select jsonb_agg(x order by x.entradas desc, x.nombre)
      from (select s.nombre_publico as nombre, sum(i.cantidad)::integer as entradas, sum(i.subtotal)::integer as vendido
            from public.orders o join public.sellers s on s.id = o.seller_id
            join public.order_items i on i.order_id = o.id
            where o.event_id = p_event_id and o.status = 'aprobado'
            group by s.nombre_publico) x), '[]'::jsonb)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos: estas funciones las llama el admin con su sesión (y verifican que lo sea).
-- ─────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_crear_evento(jsonb)', 'admin_editar_evento(uuid, jsonb)',
    'admin_estado_evento(uuid, boolean, boolean)', 'admin_duplicar_evento(uuid)',
    'admin_eliminar_evento(uuid)', 'admin_guardar_tipo(uuid, uuid, jsonb)', 'admin_borrar_tipo(uuid)',
    'admin_aprobar_pedido(uuid)', 'admin_rechazar_pedido(uuid, text)', 'admin_anular_entrada(uuid, text)',
    'admin_aprobar_acceso(uuid, text, boolean, integer)', 'admin_rechazar_acceso(uuid)',
    'admin_editar_rrpp(uuid, jsonb)', 'admin_saldos_rrpp()', 'admin_pagar_comision(uuid, integer, text, text)',
    'admin_registrar_rendicion(uuid, integer, integer, text)', 'admin_resumen_evento(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
