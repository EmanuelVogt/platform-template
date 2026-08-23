# syntax=docker/dockerfile:1.7
# Contexto de build = raiz do monorepo (Docker Context Path = .)
#
# Servidor Next.js standalone (non-root, porta 3000).
# NEXT_PUBLIC_API_URL é cozido no build (Next injeta em process.env em build-time) -> passar como build-arg.

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

# 2. Install + build standalone
FROM base AS builder
# ARG vira ENV: garante que o Next build leia NEXT_PUBLIC_API_URL do process.env e
# que o BuildKit invalide o cache da layer quando a URL mudar (ARG solto, sem
# referência, pode dar cache-hit e cozinhar bundle sem a env).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY --from=pruner /app/out/full/ .
# openapi.json mora na raiz, fora de qualquer package: turbo prune não inclui.
# O generate do @platform/api-client lê ../../openapi.json.
COPY openapi.json ./openapi.json
RUN pnpm turbo build --filter=web

# 3. Servidor Next.js standalone non-root (porta 3000)
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
