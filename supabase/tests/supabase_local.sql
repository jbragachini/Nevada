-- Imitación mínima de Supabase para probar las migraciones en un PostgreSQL común.
-- Solo para pruebas locales (scripts/probar-base.sh). NO se ejecuta en Supabase.
--
-- Reproduce lo que importa para la seguridad:
--   • los roles anon, authenticated y service_role (este último saltea RLS);
--   • auth.users y auth.uid(), que en Supabase lee el usuario de la sesión;
--   • los permisos por defecto de Supabase: todo para anon y authenticated, y RLS decide.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'local';
grant anon, authenticated, service_role to authenticator;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text
);

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
    ), ''
  )::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
