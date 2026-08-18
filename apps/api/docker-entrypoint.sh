#!/bin/sh
set -e

# Aplica migrations antes de subir o app (fail-fast: schema errado aborta o boot).
# RUN_MIGRATIONS=false desliga este passo — use quando um job/init-container
# dedicado já migra e as réplicas do app só servem.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] aplicando migrations do banco..."
  node dist/db/migrate
fi

# Bootstrap do superusuário master só quando a credencial vem do env. Sem os
# secrets é no-op — o seed dev (db:seed, NODE_ENV-guard) nunca roda aqui.
# Idempotente (onConflictDoNothing por e-mail): seguro a cada boot e por réplica.
if [ -n "${MASTER_EMAIL:-}" ] && [ -n "${MASTER_PASSWORD:-}" ]; then
  echo "[entrypoint] bootstrap do superusuário master..."
  node dist/seeds/bootstrap-master
fi

# Backfill legado opcional. Default off: o padrão é disparar como job de deploy
# (`docker run --rm <img> node dist/legacy-import/run`). Com RUN_BACKFILL=true roda
# no boot — seguro porque é auto-guardado (ledger _sync.states + advisory lock):
# re-execução vira no-op. O demo seed nunca roda em prod (guard NODE_ENV).
if [ "${RUN_BACKFILL:-false}" = "true" ]; then
  echo "[entrypoint] backfill legado (auto-guardado)..."
  node dist/legacy-import/run
fi

exec "$@"
