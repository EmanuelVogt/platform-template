#!/bin/sh
set -e

# Dev não migra sozinho no boot (só o entrypoint de prod). Aplica antes de subir.
echo "[dev] aplicando migrations..."
pnpm --filter api db:migrate:run

exec "$@"
