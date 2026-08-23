#!/bin/sh
set -e

# Aplica migrations antes de subir o app (fail-fast: schema errado aborta o boot).
# RUN_MIGRATIONS=false desliga este passo — use quando um job/init-container
# dedicado já migra e as réplicas do app só servem.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] aplicando migrations do banco..."
  node dist/db/migrate
fi

# Bootstrap do superusuário master de cada módulo instalado, só quando a
# credencial vem do env. Sem os secrets é no-op — o seed dev (db:seed,
# NODE_ENV-guard) nunca roda aqui. Idempotente: seguro a cada boot e por réplica.
if [ -n "${MASTER_EMAIL:-}" ] && [ -n "${MASTER_PASSWORD:-}" ]; then
  echo "[entrypoint] bootstrap dos seeds de boot dos módulos..."
  for f in "${DIST_DIR:-dist}"/modules/*/seeds/bootstrap.js; do
    [ -e "$f" ] && node "$f"
  done
fi

exec "$@"
