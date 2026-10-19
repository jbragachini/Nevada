-- Pruebas de la etapa 7: la Puerta. Corre después de admin.sql y usa sus datos (entradas de
-- Navidad: válidas de Juan Pérez, Sofía Gómez y otras; anulada de Carlos Ruiz).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

\set lucas '\'a0000000-0000-0000-0000-00000000000b\''

create function pruebas.escanear(token text, evento uuid default null) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', 'a0000000-0000-0000-0000-00000000000a', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
  v := public.puerta_escanear(coalesce(evento, (select id from public.events where nombre = 'Navidad con Nevada 2026')),
                              token, 'prueba');
  perform set_config('role', 'postgres', true);
  return v;
end;
$$;
create function pruebas.token(titular text) returns text language sql as $$
  select qr_token from public.tickets where titular_nombre = titular limit 1;
$$;

select pruebas.igual('cada entrada tiene un código corto de 8 caracteres y único',
  (select count(*) = count(distinct codigo) and min(char_length(codigo)) = 8 from public.tickets), true);

select pruebas.igual('una entrada válida pasa',
  (select j ->> 'resultado' || ':' || (j ->> 'titular') || ':' || (j ->> 'ingresos')
   from (select pruebas.escanear(pruebas.token('Juan Pérez')) j) x),
  'valida:Juan Pérez:1');
select pruebas.igual('la segunda vez dice que ya se usó, con la hora del primer ingreso',
  (select j ->> 'resultado' || ':' || ((j ->> 'usada_en') is not null)
   from (select pruebas.escanear(pruebas.token('Juan Pérez')) j) x),
  'usada:true');
select pruebas.igual('queda registrado el ingreso',
  (select count(*) from public.checkins c join public.tickets t on t.id = c.ticket_id
   where t.titular_nombre = 'Juan Pérez'), 1::bigint);
select pruebas.igual('el código corto tipeado a mano también sirve (sin importar mayúsculas)',
  (select pruebas.escanear(lower((select codigo from public.tickets where titular_nombre = 'Sofía Gómez'))) ->> 'resultado'),
  'valida');
select pruebas.igual('una entrada anulada no pasa',
  (select pruebas.escanear(pruebas.token('Carlos Ruiz')) ->> 'resultado'), 'anulada');
select pruebas.igual('un código que no existe es inválido',
  (select pruebas.escanear('NOEXISTE') ->> 'resultado'), 'invalida');
select pruebas.igual('una entrada de otro evento es inválida en esta puerta',
  (select j ->> 'resultado' || ':' || (j ->> 'otro_evento') || ':' || coalesce(j ->> 'titular', 'sin datos')
   from (select pruebas.escanear(pruebas.token('Ana Díaz'),
                                 (select id from public.events where nombre = 'Fin de Año Nevada')) j) x),
  'invalida:true:sin datos');
select pruebas.igual('y sigue válida para su evento',
  (select status from public.tickets where titular_nombre = 'Ana Díaz'), 'valida');
select pruebas.igual('se registra cada intento',
  (select count(*) from public.scan_attempts) >= 6, true);
select pruebas.igual('el resumen cuenta ingresos y lo que falta',
  pruebas.admin_valor(format($$select (j ->> 'ingresos') || ':' || ((j ->> 'faltan')::int > 0)
                               from (select public.admin_puerta_resumen(%L) j) x$$,
                             (select id from public.events where nombre = 'Navidad con Nevada 2026'))),
  '2:true');

select pruebas.igual('un RRPP no puede usar la Puerta',
  pruebas.correr($$select public.puerta_escanear(gen_random_uuid(), 'x', null)$$, 'authenticated', :lucas),
  'NEV:sin_permiso');
select pruebas.igual('el público tampoco',
  pruebas.correr($$select public.puerta_escanear(gen_random_uuid(), 'x', null)$$, 'anon'), '42501');
select pruebas.igual('ni el admin sin la doble verificación',
  pruebas.admin_sin_2fa($$select public.puerta_escanear(gen_random_uuid(), 'x', null)::text$$), 'NEV:sin_permiso');
