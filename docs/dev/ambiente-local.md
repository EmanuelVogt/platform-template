# Ambiente de dev local

A app (`api` + `web`) roda no host via `pnpm dev`. A infra (Postgres + Redis)
roda em containers via Docker, definida no [`docker-compose.yml`](../../docker-compose.yml)
na raiz.

## Pré-requisitos

- Docker Desktop (com WSL2 habilitado no Windows).
- pnpm (`npm install -g pnpm@10.33.4`).
- Dependências instaladas: `pnpm install` na raiz.

## Subir a infra

```bash
docker compose up -d        # sobe postgres_dev (5432) e redis_dev (6379)
docker compose ps           # confere o status (healthy)
docker compose logs -f      # acompanha os logs
```

Credenciais (já refletidas em `apps/api/.env`):

| Serviço  | Porta | Conexão                                          |
| -------- | ----- | ------------------------------------------------ |
| Postgres | 5432  | `postgres://devuser:devpassword@localhost:5432/devdb` |
| Redis    | 6379  | `redis://:redis@localhost:6379`                  |

## Preparar o banco

Com os containers no ar (Postgres `healthy`):

```bash
pnpm --filter api db:migrate:run   # aplica drizzle/migrations (cria schema _kernel etc.)
pnpm --filter api db:bootstrap     # opcional: usuário master inicial
pnpm --filter api db:seed          # opcional: usuário master único
pnpm --filter api db:seed:demo     # opcional: atividades e dados de demonstração
```

## Rodar a app

```bash
pnpm dev        # na raiz — sobe api (3222) e web (5173)
```

## Comandos úteis do compose

```bash
docker compose down       # para os containers (preserva os dados nos volumes)
docker compose down -v    # para e APAGA os dados (volumes postgres_data/redis_data)
docker compose restart    # reinicia
```

> **Backfill legado é opt-in.** `docker compose up -d --build` limpo sobe o service
> `api` migrado, mas **sem** backfill — não toca o MySQL legado e nunca depende dele.
> Para rodar a importação, ligue `RUN_BACKFILL=true docker compose up -d --build`; aí
> o boot exige `MYSQL_LEGACY_DATABASE` alcançável (`pnpm --filter api db:backfill:legacy`).
> Esse MySQL **não** faz parte deste compose — aponte `MYSQL_LEGACY_DATABASE` para um
> banco fora dele (ou adicione um service `mysql`) antes de ligar o backfill.
