-- Nevada Producciones
-- 0004: seguridad a nivel de fila (RLS).
--
-- Tercera barrera (ver docs/SEGURIDAD.md): aunque alguien saltee la interfaz y el servidor,
-- la base solo le devuelve lo que le corresponde.
--   anon (comprador)  no lee ninguna tabla directo: solo las vistas y funciones públicas de 0005.
--   rrpp              solo lo suyo: sus ventas, sus comisiones y sus rendiciones.
--   admin             todo.
-- Las escrituras sensibles (crear pedidos, aprobar, emitir, escanear) pasan por funciones del
-- servidor que vuelven a verificar todo; el navegador nunca escribe directo.

-- ─────────────────────────────────────────────────────────────
-- Quién es el usuario actual
-- security definer: leen profiles/sellers sin depender de sus propias políticas.
-- ─────────────────────────────────────────────────────────────

-- Admin con la doble verificación hecha en esta sesión (aal2): sin el código del celular, una
-- contraseña robada no alcanza para nada de admin.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.rol = 'admin' and p.activo
     );
$$;

create or replace function public.mi_seller_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.sellers s
  join public.profiles p on p.id = s.profile_id
  where p.id = auth.uid() and p.rol = 'rrpp' and p.activo and s.activo;
$$;

revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.mi_seller_id() from public, anon;
grant execute on function public.es_admin() to authenticated, service_role;
grant execute on function public.mi_seller_id() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- RLS activado en todas las tablas: sin política, nadie lee ni escribe.
-- (service_role, que solo usa el servidor, la saltea.)
-- ─────────────────────────────────────────────────────────────
alter table public.events             enable row level security;
alter table public.event_guests       enable row level security;
alter table public.ticket_types       enable row level security;
alter table public.profiles           enable row level security;
alter table public.access_requests    enable row level security;
alter table public.sellers            enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.order_attendees    enable row level security;
alter table public.payments           enable row level security;
alter table public.tickets            enable row level security;
alter table public.checkins           enable row level security;
alter table public.scan_attempts      enable row level security;
alter table public.commissions        enable row level security;
alter table public.commission_payouts enable row level security;
alter table public.payout_items       enable row level security;
alter table public.seller_settlements enable row level security;
alter table public.email_log          enable row level security;
alter table public.audit_log          enable row level security;

-- ─────────────────────────────────────────────────────────────
-- Admin: lee todo; escribe en la configuración (eventos, tipos, RRPP, perfiles, accesos).
-- Pedidos, pagos, entradas, comisiones y rendiciones los escribe el servidor con sus funciones.
-- ─────────────────────────────────────────────────────────────
create policy "admin gestiona eventos" on public.events
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona tipos" on public.ticket_types
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona perfiles" on public.profiles
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona accesos" on public.access_requests
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona rrpp" on public.sellers
  for all to authenticated using (public.es_admin()) with check (public.es_admin());
create policy "admin gestiona invitados" on public.event_guests
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create policy "admin lee pedidos"      on public.orders             for select to authenticated using (public.es_admin());
create policy "admin lee items"        on public.order_items        for select to authenticated using (public.es_admin());
create policy "admin lee personas"     on public.order_attendees    for select to authenticated using (public.es_admin());
create policy "admin lee pagos"        on public.payments           for select to authenticated using (public.es_admin());
create policy "admin lee entradas"     on public.tickets            for select to authenticated using (public.es_admin());
create policy "admin lee ingresos"     on public.checkins           for select to authenticated using (public.es_admin());
create policy "admin lee escaneos"     on public.scan_attempts      for select to authenticated using (public.es_admin());
create policy "admin lee comisiones"   on public.commissions        for select to authenticated using (public.es_admin());
create policy "admin lee pagos rrpp"   on public.commission_payouts for select to authenticated using (public.es_admin());
create policy "admin lee pagos items"  on public.payout_items       for select to authenticated using (public.es_admin());
create policy "admin lee rendiciones"  on public.seller_settlements for select to authenticated using (public.es_admin());
create policy "admin lee mails"        on public.email_log          for select to authenticated using (public.es_admin());
create policy "admin lee auditoria"    on public.audit_log          for select to authenticated using (public.es_admin());

-- ─────────────────────────────────────────────────────────────
-- RRPP: solo lo suyo
-- ─────────────────────────────────────────────────────────────
create policy "cada uno ve su perfil" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "cada uno ve su pedido de acceso" on public.access_requests
  for select to authenticated using (profile_id = auth.uid());
create policy "rrpp ve su ficha" on public.sellers
  for select to authenticated using (id = public.mi_seller_id());

-- Eventos con ventas abiertas (para cargar ventas) y el evento con invitación que está en la página
-- (para armar su lista de invitados o ver la palabra clave que comparte), con sus tipos y comisión.
create policy "rrpp ve eventos en venta" on public.events
  for select to authenticated using (
    public.mi_seller_id() is not null and (ventas_abiertas or (publicado and acceso in ('lista', 'clave')))
  );
create policy "rrpp ve tipos en venta" on public.ticket_types
  for select to authenticated using (
    public.mi_seller_id() is not null
    and exists (select 1 from public.events e
                where e.id = event_id and (e.ventas_abiertas or (e.publicado and e.acceso in ('lista', 'clave'))))
  );

-- Su propia lista de invitados: la ve, agrega, edita y da de baja. Nunca la de otro RRPP.
create policy "rrpp ve sus invitados" on public.event_guests
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp agrega sus invitados" on public.event_guests
  for insert to authenticated
  with check (seller_id = public.mi_seller_id() and creado_por = auth.uid());
create policy "rrpp edita sus invitados" on public.event_guests
  for update to authenticated
  using (seller_id = public.mi_seller_id()) with check (seller_id = public.mi_seller_id());
create policy "rrpp borra sus invitados" on public.event_guests
  for delete to authenticated using (seller_id = public.mi_seller_id());

create policy "rrpp ve sus ventas" on public.orders
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp ve items de sus ventas" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.seller_id = public.mi_seller_id())
  );
-- Personas y QR: solo de las ventas que cargó él (no de las compras web que lo eligieron).
create policy "rrpp ve personas de lo que cargó" on public.order_attendees
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and o.origen = 'rrpp' and o.seller_id = public.mi_seller_id())
  );
create policy "rrpp ve entradas de lo que cargó" on public.tickets
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and o.origen = 'rrpp' and o.seller_id = public.mi_seller_id())
  );
create policy "rrpp ve sus comisiones" on public.commissions
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp ve sus cobros de comision" on public.commission_payouts
  for select to authenticated using (seller_id = public.mi_seller_id());
create policy "rrpp ve sus rendiciones" on public.seller_settlements
  for select to authenticated using (seller_id = public.mi_seller_id());

-- ─────────────────────────────────────────────────────────────
-- Permisos de tabla.
-- Supabase da por defecto todos los permisos a anon y authenticated (y deja a RLS decidir).
-- Acá se achican: el navegador nunca inserta, modifica ni borra pedidos, pagos ni entradas.
-- ─────────────────────────────────────────────────────────────
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on
  public.orders, public.order_items, public.order_attendees, public.payments,
  public.tickets, public.checkins, public.scan_attempts, public.commissions,
  public.commission_payouts, public.payout_items, public.seller_settlements,
  public.email_log, public.audit_log
  from authenticated;
revoke update, delete, truncate on public.audit_log from service_role;
revoke all on sequence public.order_numero_seq from anon, authenticated;
