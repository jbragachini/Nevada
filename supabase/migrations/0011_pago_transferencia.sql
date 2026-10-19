-- Nevada Producciones
-- 0011: la compra web se paga con una transferencia común a la cuenta de Nevada (sin comisión).
-- El comprador transfiere, sube el comprobante y queda «por confirmar» hasta que el admin ve que la
-- plata entró y aprueba. Un comprobante (el mismo archivo) no sirve para dos pedidos.

-- ───────── Nuevo medio: transferencia web ─────────
do $$
declare
  c record;
begin
  -- Se reemplazan los controles que listaban los medios (no tienen nombre propio en 0003).
  for c in
    select conrelid::regclass::text as tabla, conname from pg_constraint
    where contype = 'c' and conrelid in ('public.orders'::regclass, 'public.payments'::regclass)
      and pg_get_constraintdef(oid) like '%mercadopago%'
  loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end;
$$;

alter table public.orders
  add constraint orders_metodo_pago_valido check (metodo_pago in
    ('mercadopago', 'transferencia_web', 'efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada')),
  -- La web paga con Mercado Pago o por transferencia a Nevada; las ventas de RRPP con sus medios.
  add constraint orders_metodo_segun_origen check
    ((origen = 'web') = (metodo_pago in ('mercadopago', 'transferencia_web')));

alter table public.payments
  add constraint payments_medio_valido check (medio in
    ('mercadopago', 'transferencia_web', 'efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada')),
  -- Huella del archivo del comprobante: el mismo archivo no se acepta en dos pedidos.
  add column comprobante_sha256 text unique check (comprobante_sha256 ~ '^[0-9a-f]{64}$'),
  add column comprobante_tipo   text check (comprobante_tipo in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'));

-- ───────── Compra web: ahora por transferencia y con 60 minutos para pagar ─────────
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
  p_ip_hash         text,
  p_clave           text default null
)
returns table (order_id uuid, numero text, total integer, ya_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plazo    constant interval := interval '60 minutes';
  v_event     public.events%rowtype;
  v_guest     public.event_guests%rowtype;
  v_restantes integer;
  v_seller_id uuid := p_seller_id;
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

  -- Evento con palabra clave: se vuelve a controlar acá (la página no alcanza).
  if v_event.acceso = 'clave'
     and public.clave_normalizada(v_event.clave_acceso) is distinct from public.clave_normalizada(p_clave) then
    raise exception 'NEV:clave_incorrecta';
  end if;

  -- Evento con lista: solo los invitados. Se bloquea al invitado para que dos compras a la vez
  -- no pasen su máximo.
  if v_event.acceso = 'lista' then
    select * into v_guest from public.event_guests g
    where g.event_id = p_event_id and g.email = v_email and g.activo
    for update;
    if not found then
      raise exception 'NEV:no_invitado';
    end if;
    select greatest(v_guest.max_entradas - oc.usadas, 0) into v_restantes
    from public.event_guest_ocupacion oc where oc.guest_id = v_guest.id;
    v_seller_id := coalesce(v_guest.seller_id, p_seller_id);
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
    seller_id, invitado_id, origen, metodo_pago, total, status, vence_en, idempotency_key, token_hash, ip_hash
  ) values (
    p_event_id, btrim(p_nombre), btrim(p_apellido), v_email, nullif(btrim(p_whatsapp), ''),
    v_seller_id, v_guest.id, 'web', 'transferencia_web', 0, 'pendiente_pago', now() + v_plazo,
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
  if v_guest.id is not null and v_unidades > v_restantes then
    raise exception 'NEV:supera_invitacion' using detail = v_restantes::text;
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

-- ───────── El link del pedido dice cómo se paga ─────────
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
    'metodo', o.metodo_pago,
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
                          where k.order_id = o.id and k.status <> 'anulada'),
    -- Las entradas del pedido (para mostrar los QR en el link privado una vez aprobado).
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'titular', k.titular_nombre, 'tipo', t.nombre, 'qr_token', k.qr_token, 'status', k.status
             ) order by t.orden, k.titular_nombre)
      from public.tickets k join public.ticket_types t on t.id = k.ticket_type_id
      where k.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.events e on e.id = o.event_id
  where o.token_hash = p_token_hash;
$$;

-- ───────── El comprador sube el comprobante ─────────
-- Lo llama solo el servidor (service_role), después de guardar el archivo en el Storage privado.
-- Si la reserva ya venció, se acepta igual mientras quede cupo (la persona ya transfirió).
create or replace function public.registrar_comprobante(
  p_token_hash text,
  p_path       text,
  p_sha256     text,
  p_tipo       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item  record;
  v_ocupadas integer;
begin
  select * into v_order from public.orders o where o.token_hash = p_token_hash for update;
  if not found then
    raise exception 'NEV:no_existe';
  end if;
  if v_order.origen <> 'web' or v_order.metodo_pago <> 'transferencia_web' then
    raise exception 'NEV:estado_invalido';
  end if;
  if v_order.status = 'por_confirmar' then
    raise exception 'NEV:ya_enviado';
  end if;
  if v_order.status not in ('pendiente_pago', 'vencido') then
    raise exception 'NEV:estado_invalido' using detail = v_order.status;
  end if;

  -- Vencido: vuelve a tomar el cupo solo si todavía alcanza (tipos en orden fijo, como al comprar).
  if v_order.status = 'vencido' or v_order.vence_en <= now() then
    for v_item in
      select i.ticket_type_id, i.cantidad, t.cupo_total, t.nombre
      from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id
      where i.order_id = v_order.id
      order by i.ticket_type_id
    loop
      perform 1 from public.ticket_types t where t.id = v_item.ticket_type_id for update;
      select oc.ocupadas into v_ocupadas
      from public.ticket_type_ocupacion oc where oc.ticket_type_id = v_item.ticket_type_id;
      if v_ocupadas + v_item.cantidad > v_item.cupo_total then
        update public.orders o set status = 'vencido' where o.id = v_order.id;
        raise exception 'NEV:sin_cupo' using detail = v_item.nombre;
      end if;
    end loop;
  end if;

  if exists (select 1 from public.payments p where p.comprobante_sha256 = p_sha256) then
    raise exception 'NEV:comprobante_repetido';
  end if;

  insert into public.payments (order_id, medio, monto, status, comprobante_path, comprobante_sha256, comprobante_tipo)
  values (v_order.id, 'transferencia_web', v_order.total, 'pendiente', p_path, p_sha256, p_tipo);

  update public.orders o set status = 'por_confirmar', actualizado_en = now() where o.id = v_order.id;

  insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
  values (null, 'comprobante_subido', 'orders', v_order.id::text,
          jsonb_build_object('status', v_order.status),
          jsonb_build_object('status', 'por_confirmar', 'numero', v_order.numero));

  return jsonb_build_object('numero', v_order.numero, 'status', 'por_confirmar');
exception
  when unique_violation then
    raise exception 'NEV:comprobante_repetido';
end;
$$;

revoke execute on function public.registrar_comprobante(text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_comprobante(text, text, text, text) to service_role;
