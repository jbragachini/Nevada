-- Nevada Producciones
-- 0006: primer evento, en la página y con las ventas CERRADAS.
-- Precios, cupos y comisiones son valores iniciales: se cambian desde el panel admin (etapa 4)
-- o, mientras tanto, desde el SQL Editor de Supabase.

with ev as (
  insert into public.events (nombre, subtitulo, fecha_inicio, lugar, ciudad, publicado, ventas_abiertas)
  select 'Navidad con Nevada 2026', 'DJ Nacho Heisecke', '2026-12-24 23:59:00-03',
         'Lugar a confirmar', 'Oncativo, Córdoba', true, false
  where not exists (select 1 from public.events)
  returning id
)
insert into public.ticket_types (event_id, nombre, descripcion, precio, cupo_total, comision_rrpp, orden)
select ev.id, v.nombre, v.descripcion, v.precio, v.cupo, 0, v.orden
from ev
cross join (values
  ('Entrada General', 'Acceso general al evento',  15000, 400, 1),
  ('Entrada +25',     'Acceso para mayores de 25', 20000, 200, 2)
) as v(nombre, descripcion, precio, cupo, orden);
