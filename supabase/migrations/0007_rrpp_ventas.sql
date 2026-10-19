-- Nevada Producciones
-- 0007: lo que usan el ingreso y el panel del RRPP (etapa 3).
--   • email_de_usuario(): para entrar con usuario en vez de mail (solo servidor).
--   • emitir_entradas(): crea una entrada con QR por persona y la comisión del RRPP (interna).
--   • cargar_venta_rrpp(): el RRPP carga una venta con una persona por entrada.
--   • panel_rrpp(): números del panel del RRPP que llama.

-- ─────────────────────────────────────────────────────────────
-- Mail de un usuario, para el ingreso con usuario. Solo el servidor la puede llamar.
-- ─────────────────────────────────────────────────────────────
create or replace function public.email_de_usuario(p_usuario text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.usuario = lower(btrim(p_usuario));
$$;

revoke execute on function public.email_de_usuario(text) from public, anon, authenticated;
grant execute on function public.email_de_usuario(text) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Emitir entradas de un pedido aprobado.
-- Una entrada por persona cargada (ventas de RRPP) o, si no hay personas, una por unidad a nombre
-- del comprador (compras web). Nunca emite dos veces: bloquea el pedido y sale si ya tiene entradas.
-- El QR lleva qr_token más una firma HMAC que agrega el servidor (no se puede fabricar uno válido).
-- ─────────────────────────────────────────────────────────────
create or replace function public.emitir_entradas(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_emitidas integer;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'aprobado' then
    raise exception 'NEV:pedido_no_aprobado';
  end if;
  if exists (select 1 from public.tickets t where t.order_id = p_order_id) then
    return 0;
  end if;

  -- 2 UUID v4 sin guiones: 244 bits aleatorios.
  if exists (select 1 from public.order_attendees a where a.order_id = p_order_id) then
    insert into public.tickets (order_id, order_item_id, ticket_type_id, qr_token, titular_nombre, titular_email)
    select a.order_id, a.order_item_id, i.ticket_type_id,
           replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           a.nombre, a.email
    from public.order_attendees a
    join public.order_items i on i.id = a.order_item_id
    where a.order_id = p_order_id;
  else
    insert into public.tickets (order_id, order_item_id, ticket_type_id, qr_token, titular_nombre, titular_email)
    select i.order_id, i.id, i.ticket_type_id,
           replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           v_order.comprador_nombre || ' ' || v_order.comprador_apellido, v_order.comprador_email
    from public.order_items i
    cross join lateral generate_series(1, i.cantidad)
    where i.order_id = p_order_id;
  end if;
  get diagnostics v_emitidas = row_count;

  -- Comisión del RRPP: monto fijo por entrada, congelado en el pedido.
  if v_order.seller_id is not null then
    insert into public.commissions (order_id, seller_id, monto)
    select p_order_id, v_order.seller_id, coalesce(sum(i.cantidad * i.comision_unitaria), 0)
    from public.order_items i where i.order_id = p_order_id
    on conflict (order_id) do nothing;
  end if;

  return v_emitidas;
end;
$$;

revoke execute on function public.emitir_entradas(uuid) from public, anon, authenticated;
grant execute on function public.emitir_entradas(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Venta cargada por el RRPP.
-- p_personas: [{"ticket_type_id": "...", "nombre": "Nombre Apellido", "email": "..."}], una por
-- entrada. El mail de la persona 1 es obligatorio; si otra no tiene, usa el de la persona 1.
-- Medio de pago:
--   efectivo_rrpp         entradas al instante, sin aprobación; el RRPP rinde el total
--   transferencia_rrpp    queda por confirmar (el admin lo confirma con el RRPP); rinde el total
--   transferencia_nevada  queda por confirmar (el admin ve el ingreso); no rinde
-- El RRPP sale de la sesión (auth.uid()), nunca de lo que manda el navegador.
-- ─────────────────────────────────────────────────────────────
create or replace function public.cargar_venta_rrpp(
  p_event_id        uuid,
  p_personas        jsonb,
  p_metodo          text,
  p_whatsapp        text,
  p_idempotency_key uuid,
  p_token_hash      text
)
returns table (order_id uuid, numero text, total integer, status text, ya_existia boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seller    public.sellers%rowtype;
  v_event     public.events%rowtype;
  v_tipo      public.ticket_types%rowtype;
  v_item      record;
  v_ocupadas  integer;
  v_total     integer;
  v_order_id  uuid;
  v_numero    text;
  v_status    text;
  v_item_id   uuid;
  v_email1    text;
  v_nombre1   text;
  v_n         integer;
begin
  select s.* into v_seller from public.sellers s where s.id = public.mi_seller_id();
  if not found then
    raise exception 'NEV:sin_permiso';
  end if;
  if not v_seller.puede_cargar_ventas then
    raise exception 'NEV:no_carga_ventas';
  end if;

  -- Reintento: devuelve la venta ya cargada (solo si es de este mismo RRPP).
  select o.id, o.numero, o.total, o.status into v_order_id, v_numero, v_total, v_status
  from public.orders o where o.idempotency_key = p_idempotency_key and o.seller_id = v_seller.id;
  if found then
    return query select v_order_id, v_numero, v_total, v_status, true;
    return;
  end if;
  v_total := 0;

  if p_metodo not in ('efectivo_rrpp', 'transferencia_rrpp', 'transferencia_nevada') then
    raise exception 'NEV:metodo_invalido';
  end if;
  if p_personas is null or jsonb_typeof(p_personas) <> 'array' then
    raise exception 'NEV:sin_entradas';
  end if;
  v_n := jsonb_array_length(p_personas);
  if v_n = 0 then
    raise exception 'NEV:sin_entradas';
  end if;
  if v_n > 20 then
    raise exception 'NEV:cantidad_maxima';
  end if;

  select * into v_event from public.events e where e.id = p_event_id for share;
  if not found then
    raise exception 'NEV:evento_no_disponible';
  end if;
  if not v_event.ventas_abiertas then
    raise exception 'NEV:ventas_cerradas';
  end if;

  v_nombre1 := btrim(p_personas -> 0 ->> 'nombre');
  v_email1 := lower(btrim(p_personas -> 0 ->> 'email'));
  if v_nombre1 is null or v_nombre1 !~ '\S+\s+\S+' then
    raise exception 'NEV:persona_sin_nombre' using detail = '1';
  end if;
  if v_email1 is null or v_email1 = '' then
    raise exception 'NEV:persona_sin_email';
  end if;
  for v_n in 1 .. jsonb_array_length(p_personas) loop
    if coalesce(btrim(p_personas -> (v_n - 1) ->> 'nombre'), '') !~ '\S+\s+\S+' then
      raise exception 'NEV:persona_sin_nombre' using detail = v_n::text;
    end if;
  end loop;

  -- El comprador del pedido es la persona 1: nombre y apellido de al menos 2 letras.
  if char_length(split_part(v_nombre1, ' ', 1)) < 2
     or char_length(btrim(substr(v_nombre1, length(split_part(v_nombre1, ' ', 1)) + 1))) < 2 then
    raise exception 'NEV:persona_sin_nombre' using detail = '1';
  end if;

  v_status := case when p_metodo = 'efectivo_rrpp' then 'aprobado' else 'por_confirmar' end;

  insert into public.orders (
    event_id, comprador_nombre, comprador_apellido, comprador_email, comprador_whatsapp,
    seller_id, origen, metodo_pago, total, status, idempotency_key, token_hash, creado_por
  ) values (
    p_event_id,
    split_part(v_nombre1, ' ', 1),
    btrim(substr(v_nombre1, length(split_part(v_nombre1, ' ', 1)) + 1)),
    v_email1, nullif(btrim(p_whatsapp), ''),
    v_seller.id, 'rrpp', p_metodo, 0, v_status, p_idempotency_key, p_token_hash, auth.uid()
  )
  returning id, orders.numero into v_order_id, v_numero;

  -- Tipos en orden fijo (evita bloqueos cruzados), con el cupo bloqueado mientras se cuenta.
  for v_item in
    select (x ->> 'ticket_type_id')::uuid as ticket_type_id, count(*)::integer as cantidad
    from jsonb_array_elements(p_personas) x
    group by 1
    order by 1
  loop
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
            v_tipo.comision_rrpp, v_item.cantidad * v_tipo.precio)
    returning id into v_item_id;

    insert into public.order_attendees (order_id, order_item_id, nombre, email)
    select v_order_id, v_item_id, btrim(x ->> 'nombre'),
           coalesce(nullif(lower(btrim(x ->> 'email')), ''), v_email1)
    from jsonb_array_elements(p_personas) x
    where (x ->> 'ticket_type_id')::uuid = v_tipo.id;

    v_total := v_total + v_item.cantidad * v_tipo.precio;
  end loop;

  update public.orders o set total = v_total where o.id = v_order_id;

  insert into public.payments (order_id, medio, monto, status)
  values (v_order_id, p_metodo, v_total,
          case when p_metodo = 'efectivo_rrpp' then 'acreditado' else 'pendiente' end);

  if v_status = 'aprobado' then
    perform public.emitir_entradas(v_order_id);
  end if;

  insert into public.audit_log (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'venta_rrpp_cargada', 'orders', v_order_id::text,
          jsonb_build_object('numero', v_numero, 'total', v_total, 'metodo', p_metodo,
                             'entradas', jsonb_array_length(p_personas)));

  return query select v_order_id, v_numero, v_total, v_status, false;

exception
  when unique_violation then
    select o.id, o.numero, o.total, o.status into v_order_id, v_numero, v_total, v_status
    from public.orders o where o.idempotency_key = p_idempotency_key and o.seller_id = v_seller.id;
    if not found then
      raise;
    end if;
    return query select v_order_id, v_numero, v_total, v_status, true;
end;
$$;

revoke execute on function public.cargar_venta_rrpp(uuid, jsonb, text, text, uuid, text) from public, anon;
grant execute on function public.cargar_venta_rrpp(uuid, jsonb, text, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Panel del RRPP que llama (todos los eventos).
--   vendidas / vendido        pedidos aprobados a su nombre (cargados por él o web que lo eligieron)
--   comisión                  generada (pedidos aprobados), cobrada (pagos registrados), pendiente
--   a rendir                  lo cobrado a su nombre (efectivo y transferencias a él) menos lo rendido
-- ─────────────────────────────────────────────────────────────
create or replace function public.panel_rrpp()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select s.* from public.sellers s where s.id = public.mi_seller_id()
  ),
  aprob as (
    select o.* from public.orders o, s where o.seller_id = s.id and o.status = 'aprobado'
  ),
  rendido as (
    select coalesce(sum(r.monto_efectivo), 0) as efectivo,
           coalesce(sum(r.monto_transferencia), 0) as transferencia
    from public.seller_settlements r, s where r.seller_id = s.id
  )
  select jsonb_build_object(
    'nombre', s.nombre_publico,
    'codigo', s.codigo,
    'puede_cargar_ventas', s.puede_cargar_ventas,
    'max_invitados', s.max_invitados,
    'entradas', (select coalesce(sum(i.cantidad), 0) from public.order_items i
                 where i.order_id in (select id from aprob)),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'cantidad', x.cantidad)
                                           order by x.cantidad desc)
                          from (select t.nombre, sum(i.cantidad)::integer as cantidad
                                from public.order_items i
                                join public.ticket_types t on t.id = i.ticket_type_id
                                where i.order_id in (select id from aprob)
                                group by t.nombre) x), '[]'::jsonb),
    'vendido', (select coalesce(sum(total), 0) from aprob),
    'comision_generada', (select coalesce(sum(c.monto), 0) from public.commissions c
                          where c.seller_id = s.id and c.status <> 'anulada'),
    'comision_cobrada', (select coalesce(sum(p.monto), 0) from public.commission_payouts p
                         where p.seller_id = s.id),
    'cobrado_efectivo', (select coalesce(sum(total), 0) from aprob where metodo_pago = 'efectivo_rrpp'),
    'cobrado_transferencia', (select coalesce(sum(total), 0) from aprob where metodo_pago = 'transferencia_rrpp'),
    'rendido_efectivo', rendido.efectivo,
    'rendido_transferencia', rendido.transferencia,
    'por_aprobar', (select count(*) from public.orders o
                    where o.seller_id = s.id and o.status in ('pagado', 'por_confirmar'))
  )
  from s, rendido;
$$;

revoke execute on function public.panel_rrpp() from public, anon;
grant execute on function public.panel_rrpp() to authenticated;
