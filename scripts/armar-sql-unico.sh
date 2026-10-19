#!/usr/bin/env bash
# Junta todas las migraciones en supabase/todo-en-uno.sql, para pegarlas de una sola vez en el
# SQL Editor de Supabase en un proyecto NUEVO. Volver a correrlo cada vez que se agrega una migración.
set -euo pipefail
cd "$(dirname "$0")/.."
{
  echo "-- Nevada Producciones: base completa (generado por scripts/armar-sql-unico.sh)."
  echo "-- Pegar entero en Supabase → SQL Editor → Run, UNA sola vez, en un proyecto nuevo."
  echo
  for f in supabase/migrations/*.sql; do
    echo "-- ═════════════ $(basename "$f") ═════════════"
    cat "$f"
    echo
  done
} > supabase/todo-en-uno.sql
echo "Listo: supabase/todo-en-uno.sql"
