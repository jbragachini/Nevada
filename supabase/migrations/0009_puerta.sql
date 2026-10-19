-- Nevada Producciones
-- 0009: la Puerta (etapa 7).
--   • Código corto por entrada (8 caracteres) para tipearlo si el QR no se puede leer.
--   • puerta_escanear(): valida una entrada en la puerta de forma atómica.
--   • admin_puerta_resumen(): ingresos del evento.
-- Solo el admin (con doble verificación) puede usar la Puerta.

-- Código corto: los primeros 8 caracteres del token aleatorio, en mayúsculas (32 bits al azar).
alter table public.tickets
  add column codigo text generated always as (upper(left(qr_token, 8))) stored;
create unique index tickets_codigo on public.tickets (codigo);

-- ─────────────────────────────────────────────────────────────
-- Escanear una entrada.
-- p_token: el qr_token (el servidor ya verificó la firma del QR) o el código corto tipeado a mano.
-- Atómico: el UPDATE … WHERE status = 'valida' deja pasar a uno solo aunque dos celulares lean la
-- misma entrada al mismo tiempo; el otro recibe «usada» con la hora del primer ingreso.
-- Resultados: valida | usada | anulada | invalida (no existe o es de otro evento).
-- ─────────────────────────────────────────────────────────────
create or replace function public.puerta_escanear(p_event_id uuid, p_token text, p_dispositivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leido text := btrim(coalesce(p_token, ''));
  v_ticket public.tickets%rowtype;
  v_evento uuid;
  v_resultado text;
  v_tipo text;
  v_numero text;
begin
  perform public.exigir_admin();

  -- Intento de ingreso: la entrada válida de este evento pasa a usada, de una sola vez.
  update public.tickets t set status = 'usada', usada_en = now()
  from public.ticket_types tt
  where tt.id = t.ticket_type_id and tt.event_id = p_event_id and t.status = 'valida'
    and (t.qr_token = v_leido or t.codigo = upper(v_leido))
  returning t.* into v_ticket;

  if found then
    insert into public.checkins (ticket_id, escaneado_por, dispositivo)
    values (v_ticket.id, auth.uid(), left(p_dispositivo, 120));
    v_resultado := 'valida';
  else
    select t.* into v_ticket from public.tickets t
    where t.qr_token = v_leido or t.codigo = upper(v_leido)
    limit 1;
    if not found then
      v_resultado := 'invalida';
    else
      select tt.event_id into v_evento from public.ticket_types tt where tt.id = v_ticket.ticket_type_id;
      v_resultado := case
        when v_evento <> p_event_id then 'invalida'
        when v_ticket.status = 'anulada' then 'anulada'
        else 'usada'
      end;
    end if;
  end if;

  insert into public.scan_attempts (qr_token_leido, resultado, escaneado_por)
  values (left(v_leido, 200), v_resultado, auth.uid());

  if v_ticket.id is not null then
    select tt.nombre into v_tipo from public.ticket_types tt where tt.id = v_ticket.ticket_type_id;
    select o.numero into v_numero from public.orders o where o.id = v_ticket.order_id;
  end if;

  return jsonb_build_object(
    'resultado', v_resultado,
    'otro_evento', v_ticket.id is not null and v_resultado = 'invalida',
    'titular', case when v_resultado = 'invalida' then null else v_ticket.titular_nombre end,
    'tipo', case when v_resultado = 'invalida' then null else v_tipo end,
    'numero', case when v_resultado = 'invalida' then null else v_numero end,
    'usada_en', case when v_resultado = 'usada' then v_ticket.usada_en end,
    'ingresos', (select count(*) from public.checkins c join public.tickets k on k.id = c.ticket_id
                 join public.ticket_types tt on tt.id = k.ticket_type_id where tt.event_id = p_event_id)
  );
end;
$$;

-- Ingresos y entradas válidas que faltan entrar.
create or replace function public.admin_puerta_resumen(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'ingresos', (select count(*) from public.tickets k join public.ticket_types tt on tt.id = k.ticket_type_id
                 where tt.event_id = p_event_id and k.status = 'usada'),
    'faltan', (select count(*) from public.tickets k join public.ticket_types tt on tt.id = k.ticket_type_id
               where tt.event_id = p_event_id and k.status = 'valida')
  );
end;
$$;

revoke execute on function public.puerta_escanear(uuid, text, text) from public, anon;
revoke execute on function public.admin_puerta_resumen(uuid) from public, anon;
grant execute on function public.puerta_escanear(uuid, text, text) to authenticated;
grant execute on function public.admin_puerta_resumen(uuid) to authenticated;
