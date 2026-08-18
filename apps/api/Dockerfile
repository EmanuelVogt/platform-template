# syntax=docker/dockerfile:1.7
# Contexto de build = raiz do monorepo (Docker Context Path = .)
#
# Pipeline: prune (turbo) -> install+build -> prod-deps -> runtime non-root.
# Store pnpm em cache mount BuildKit: rebuild reaproveita pacotes baixados.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    PUPPETEER_SKIP_DOWNLOAD=true
RUN corepack enable
WORKDIR /app

# 1. Recorta o subgrafo do package "api" (turbo pinado p/ build determinístico)
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.9.15 prune api --docker

# 2. Install completo + build
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=api

# 3. Árvore de dependências só de produção (sem devDependencies)
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir=/pnpm/store

# 4. Runtime mínimo, non-root, com init e healthcheck
FROM node:22-slim AS runner
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# tini: PID 1 correto (forward de sinais + reaping de zumbis)
# chromium + fontes: renderização de PDF dos relatórios. Sem fonts-liberation
# a acentuação sai como caixa vazia no PDF.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
COPY --from=prod-deps --chown=node:node /app/node_modules          /app/node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules  ./node_modules
COPY --from=builder   --chown=node:node /app/apps/api/dist          ./dist
# Migrations aplicadas em runtime pelo entrypoint (drizzle-orm migrator, sem
# drizzle-kit). Os .sql precisam estar na imagem.
COPY --from=builder   --chown=node:node /app/apps/api/drizzle/migrations ./drizzle/migrations
COPY --chown=node:node --chmod=0755 apps/api/docker-entrypoint.sh        ./docker-entrypoint.sh
USER node
EXPOSE 3000
# Liveness pura (/health não toca o banco): não derruba o container se o Postgres oscilar
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"
# Entrypoint roda migrations (RUN_MIGRATIONS=true por default) e então exec o CMD.
ENTRYPOINT ["tini","--","/app/apps/api/docker-entrypoint.sh"]
CMD ["node","dist/main"]
