#!/bin/sh
set -e

# Dev não migra sozinho no boot (só o entrypoint de prod). Aplica antes de subir.
echo "[dev] aplicando migrations..."
pnpm --filter api db:migrate:run

# Backfill legado opcional. Default off (espelha prod). Com RUN_BACKFILL=true
# roda no boot — auto-guardado via `_sync.states` (já ancorado → no-op).
# Sync contínuo sobe depois, no Nest (`SyncLegacyModule`), não aqui.
if [ "${RUN_BACKFILL:-false}" = "true" ]; then
  echo "[dev] backfill legado (auto-guardado)..."
  pnpm --filter api db:backfill:legacy
fi

exec "$@"
