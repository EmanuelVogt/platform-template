# Local dev environment

The app (`api` + `web`) runs on the host via `pnpm dev`. The infra (Postgres + Redis)
runs in containers via Docker, defined in the [`docker-compose.yml`](../../docker-compose.yml)
at the root.

## Prerequisites

- Docker Desktop (with WSL2 enabled on Windows).
- pnpm (`npm install -g pnpm@10.33.4`).
- Dependencies installed: `pnpm install` at the root.

## Bring up the infra

```bash
docker compose up -d        # brings up postgres_dev (5432) and redis_dev (6379)
docker compose ps           # checks the status (healthy)
docker compose logs -f      # follows the logs
```

Credentials (already reflected in `apps/api/.env`):

| Service  | Port | Connection                                            |
| -------- | ---- | ----------------------------------------------------- |
| Postgres | 5432 | `postgres://devuser:devpassword@localhost:5432/devdb` |
| Redis    | 6379 | `redis://:redis@localhost:6379`                       |

## Prepare the database

With the containers up (Postgres `healthy`):

```bash
pnpm --filter api db:migrate:run   # applies drizzle/migrations (creates the _kernel schema etc.)
pnpm --filter api db:bootstrap     # optional: initial master user
pnpm --filter api db:seed          # optional: single master user
pnpm --filter api db:seed:demo     # optional: activities and demo data
```

## Run the app

```bash
pnpm dev        # at the root — brings up api (3222) and web (5173)
```

## Useful compose commands

```bash
docker compose down       # stops the containers (keeps the data in the volumes)
docker compose down -v    # stops and DELETES the data (volumes postgres_data/redis_data)
docker compose restart    # restarts
```

> **Legacy backfill is opt-in.** A clean `docker compose up -d --build` brings up the
> `api` service migrated, but **without** backfill — it does not touch the legacy MySQL and
> never depends on it. To run the import, enable `RUN_BACKFILL=true docker compose up -d --build`;
> the boot then requires a reachable `MYSQL_LEGACY_DATABASE` (`pnpm --filter api db:backfill:legacy`).
> That MySQL is **not** part of this compose — point `MYSQL_LEGACY_DATABASE` to a
> database outside it (or add a `mysql` service) before enabling the backfill.
