-- Nevada Producciones
-- 0012: mails y Mercado Pago como medio opcional.
--
-- Mails: se suma el aviso de pedido rechazado al registro de mails.
-- Mercado Pago: el comprador puede pagar el pedido web con Checkout Pro (si Nevada cargó sus
-- credenciales). El servidor verifica el aviso firmado de Mercado Pago, consulta el pago y recién
-- entonces llama a registrar_pago_mp(): el pedido pasa a «pagado» y espera la aprobación del admin,
-- igual que una transferencia. Las entradas se emiten solo al aprobar.

-- ───────── Mails ─────────
alter table public.email_log drop constraint if exists email_log_tipo_check;
alter table public.email_log
  add constraint email_log_tipo_check
  check (tipo in ('entradas', 'reenvio', 'pedido_recibido', 'pedido_rechazado'));

create index if not exists email_log_order on public.email_log (order_id, tipo);

-- ───────── Mercado Pago ─────────
-- Registra un pago informado por Mercado Pago (ya verificado por el servidor contra su API).
--   p_estado: el estado del pago en Mercado Pago (approved, refunded, charged_back, rejected…).
-- Es idempotente: el mismo pago (mp_payment_id) avisado dos veces no cambia nada.
-- Devuelve: 'pagado' | 'ya_registrado' | 'monto_distinto' | 'pedido_cerrado' | 'reembolsado' | 'ignorado'.
create or replace function public.registrar_pago_mp(
  p_numero        text,
  p_mp_payment_id text,
  p_monto         integer,
  p_estado        text,
  p_raw           jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_pago  public.payments%rowtype;
begin
  if p_mp_payment_id is null or p_mp_payment_id !~ '^[0-9]{1,30}$' then
    raise exception 'NEV:pago_invalido';
  end if;
  select * into v_order from public.orders o where o.numero = p_numero for update;
  if not found or v_order.origen <> 'web' then
    raise exception 'NEV:no_existe';
  end if;
  select * into v_pago from public.payments p where p.mp_payment_id = p_mp_payment_id;

  -- Devolución o contracargo de un pago ya registrado: queda anotado para que el admin decida.
  if p_estado in ('refunded', 'charged_back', 'cancelled') then
    if v_pago.id is null or v_pago.status = 'reembolsado' then
      return 'ignorado';
    end if;
    update public.payments p set status = 'reembolsado', raw_webhook = p_raw where p.id = v_pago.id;
    insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
    values (null, 'pago_mp_devuelto', 'orders', v_order.id::text,
            jsonb_build_object('status', v_order.status),
            jsonb_build_object('numero', v_order.numero, 'mp_payment_id', p_mp_payment_id, 'estado', p_estado));
    return 'reembolsado';
  end if;

  if p_estado <> 'approved' then
    return 'ignorado';
  end if;
  if v_pago.id is not null then
    return 'ya_registrado';
  end if;

  -- El monto lo fija el pedido: un pago por menos no lo da por pagado.
  if p_monto is null or p_monto < v_order.total then
    insert into public.payments (order_id, medio, mp_payment_id, monto, status, raw_webhook)
    values (v_order.id, 'mercadopago', p_mp_payment_id, coalesce(p_monto, 0), 'acreditado', p_raw);
    insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
    values (null, 'pago_mp_monto_distinto', 'orders', v_order.id::text,
            jsonb_build_object('total', v_order.total),
            jsonb_build_object('numero', v_order.numero, 'mp_payment_id', p_mp_payment_id, 'monto', p_monto));
    return 'monto_distinto';
  end if;

  insert into public.payments (order_id, medio, mp_payment_id, monto, status, raw_webhook)
  values (v_order.id, 'mercadopago', p_mp_payment_id, p_monto, 'acreditado', p_raw);

  -- Pedido ya resuelto (aprobado, rechazado, cancelado) o con otro pago en revisión: la plata entró
  -- igual, así que queda en la auditoría para devolverla desde Mercado Pago si corresponde.
  if v_order.status not in ('pendiente_pago', 'vencido') then
    insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
    values (null, 'pago_mp_sobre_pedido_cerrado', 'orders', v_order.id::text,
            jsonb_build_object('status', v_order.status),
            jsonb_build_object('numero', v_order.numero, 'mp_payment_id', p_mp_payment_id, 'monto', p_monto));
    return 'pedido_cerrado';
  end if;

  -- Pagó: el pedido ocupa su lugar aunque la reserva hubiera vencido (el admin lo ve en «Por aprobar»
  -- y, si ya no hay lugar, lo rechaza y devuelve el pago).
  update public.orders o
  set status = 'pagado', metodo_pago = 'mercadopago', vence_en = null, actualizado_en = now()
  where o.id = v_order.id;

  insert into public.audit_log (actor_id, accion, entidad, entidad_id, antes, despues)
  values (null, 'pago_mp_recibido', 'orders', v_order.id::text,
          jsonb_build_object('status', v_order.status),
          jsonb_build_object('status', 'pagado', 'numero', v_order.numero, 'mp_payment_id', p_mp_payment_id,
                             'monto', p_monto));
  return 'pagado';
exception
  when unique_violation then
    return 'ya_registrado';
end;
$$;

revoke execute on function public.registrar_pago_mp(text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pago_mp(text, text, integer, text, jsonb) to service_role;
