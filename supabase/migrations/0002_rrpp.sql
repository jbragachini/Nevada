-- Nevada Producciones
-- 0002: usuarios (admin y RRPP), pedidos de acceso y vendedores.
-- Las contraseñas las maneja Supabase Auth (auth.users); acá nunca se guardan.

-- ─────────────────────────────────────────────────────────────
-- Perfiles: uno por usuario de Supabase Auth.
-- Nadie se asigna un rol solo: el perfil lo crea el servidor y el rol lo cambia el admin.
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text        not null check (char_length(nombre) between 2 and 80),
  usuario   text        not null unique check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  rol       text        not null check (rol in ('admin', 'rrpp')),
  activo    boolean     not null default false,   -- un RRPP nuevo arranca inactivo hasta que lo aprueban
  creado_en timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Pedidos de acceso de RRPP (desde /ingresar). Quedan pendientes hasta que el admin decide.
-- ─────────────────────────────────────────────────────────────
create table public.access_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid        not null unique references public.profiles(id) on delete cascade,
  whatsapp     text        check (whatsapp ~ '^[0-9+\s()-]{8,20}$'),
  estado       text        not null default 'pendiente'
                           check (estado in ('pendiente', 'aprobada', 'rechazada')),
  revisado_por uuid        references public.profiles(id) on delete set null,
  revisado_en  timestamptz,
  creado_en    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Vendedores (RRPP). Aparecen en «¿Quién te vendió?» y tienen su link /?rrpp=codigo.
-- profile_id puede quedar vacío para un RRPP cargado por el admin sin usuario propio.
-- ─────────────────────────────────────────────────────────────
create table public.sellers (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid        unique references public.profiles(id) on delete set null,
  nombre_publico      text        not null check (char_length(nombre_publico) between 2 and 80),
  codigo              text        not null unique check (codigo ~ '^[a-z0-9-]{2,30}$'),
  puede_cargar_ventas boolean     not null default true,
  max_invitados       integer     check (max_invitados >= 0),   -- tope de invitados por evento; vacío = sin tope
  activo              boolean     not null default true,
  creado_en           timestamptz not null default now()
);
