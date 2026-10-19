-- Portada de la página de venta: el admin elige entre las dos versiones del diseño.
--   a: camino hacia la montaña
--   c: contraluz azul

alter table public.events
  add column portada text not null default 'a'
  constraint events_portada_valida check (portada in ('a', 'c'));

-- La vista pública suma la portada (al final: create or replace view solo permite agregar columnas).
create or replace view public.storefront_event as
select e.id, e.nombre, e.subtitulo, e.fecha_inicio, e.lugar, e.direccion, e.ciudad,
       e.descripcion, e.flyer_path, e.ventas_abiertas, e.acceso, e.mostrar_rrpp, e.portada
from public.events e
where e.publicado;

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
    portada      = case when p ? 'portada' then p ->> 'portada' else e.portada end,
    actualizado_por = auth.uid()
  where e.id = p_id;

  perform public.auditar('evento_editado', 'events', p_id::text, v_antes,
                         (select to_jsonb(e) from public.events e where e.id = p_id));
end;
$$;

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
                             acceso, clave_acceso, mostrar_rrpp, portada, creado_por, actualizado_por)
  select left(e.nombre, 110) || ' (copia)', e.subtitulo, e.fecha_inicio, e.lugar, e.direccion, e.ciudad,
         e.descripcion, e.flyer_path, e.acceso, e.clave_acceso, e.mostrar_rrpp, e.portada, auth.uid(), auth.uid()
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
