#!/usr/bin/env bash
# Prueba las migraciones de supabase/ en un PostgreSQL local descartable:
# crea una base vacía, aplica una imitación mínima de Supabase, todas las migraciones en orden,
# las pruebas de supabase/tests/ y una prueba de compras simultáneas por la última entrada.
#
# Uso: scripts/probar-base.sh            (necesita PostgreSQL 15+ instalado: initdb, pg_ctl, psql)
#      KEEP=1 scripts/probar-base.sh     (deja la base levantada al terminar, en el puerto 54329)
set -euo pipefail

cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
PORT="${PORT:-54329}"
DATA="$(mktemp -d)"
export PGHOST="$DATA" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres

parar() {
  if [[ "${KEEP:-}" != "1" ]]; then
    pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$DATA"
  else
    echo "Base levantada: psql -h $DATA -p $PORT -U postgres"
  fi
}
trap parar EXIT

# initdb no corre como root: si hace falta, la base corre con el usuario postgres.
COMO=()
if [[ "$(id -u)" == "0" ]]; then
  chown postgres "$DATA"
  COMO=(runuser -u postgres --)
fi

"${COMO[@]}" initdb -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${COMO[@]}" pg_ctl -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1)

echo "▸ Imitación de Supabase"
"${PSQL[@]}" -f supabase/tests/supabase_local.sql

for f in supabase/migrations/*.sql; do
  echo "▸ Migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "▸ Pruebas"
"${PSQL[@]}" -f supabase/tests/pedidos_y_seguridad.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /' | grep -v '^$'

echo "▸ Compras simultáneas"
"${PSQL[@]}" <<'SQL'
insert into public.ticket_types (event_id, nombre, precio, cupo_total, orden)
select id, 'Última', 1000, 1, 9 from public.events where publicado;
SQL
for i in $(seq 1 10); do
  "${PSQL[@]}" -t -A -c "
    select 'ok' from public.crear_pedido_web(
      (select id from public.events where publicado),
      jsonb_build_array(jsonb_build_object('ticket_type_id',
        (select id from public.ticket_types where nombre = 'Última'), 'cantidad', 1)),
      'Comprador', 'Simultáneo', 'simultaneo$i@example.com', '', null,
      gen_random_uuid(), encode(gen_random_bytes(32), 'hex'), null);" >/dev/null 2>&1 &
done
wait
VENDIDAS="$("${PSQL[@]}" -t -A -c "
  select count(*) from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id
  where t.nombre = 'Última';")"
if [[ "$VENDIDAS" != "1" ]]; then
  echo "FALLA: 10 compras simultáneas por 1 entrada vendieron $VENDIDAS" >&2
  exit 1
fi
echo "  ok  10 compras simultáneas por la última entrada: se vendió 1"

echo "✔ Todo bien"
