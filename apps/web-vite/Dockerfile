# syntax=docker/dockerfile:1.7
# Contexto de build = raiz do monorepo (Docker Context Path = .)
#
# Build estático Vite servido por nginx-unprivileged (non-root, porta 8080).
# VITE_API_URL é cozido no build (Vite injeta em build-time) -> passar como build-arg.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable
WORKDIR /app

# 1. Recorta o subgrafo do package "web"
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.9.15 prune web --docker

# 2. Install + build estático
FROM base AS builder
# ARG vira ENV: garante que o vite build leia VITE_API_URL do process.env e
# que o BuildKit invalide o cache da layer quando a URL mudar (ARG solto, sem
# referência, pode dar cache-hit e cozinhar bundle sem a env).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY --from=pruner /app/out/full/ .
# openapi.json mora na raiz, fora de qualquer package: turbo prune não inclui.
# O generate do @platform/api-client lê ../../openapi.json.
COPY openapi.json ./openapi.json
RUN pnpm turbo build --filter=web

# 3. Servidor estático non-root (porta 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
