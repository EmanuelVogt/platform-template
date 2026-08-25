# Local dev environment

The app (`api` + `web`) runs on the host via `pnpm dev`. The infra (Postgres + Redis)
runs in containers via Docker, defined in the [`docker-compose.yml`](../../docker-compose.yml)
at the root.

## Prerequisites

- Supported platforms: macOS, Linux, WSL2 on Windows. Native Windows is not supported —
  `scripts/sync-agent-skills.mjs` mirrors the agent skills via symlinks.
- Docker Desktop (with WSL2 enabled on Windows).
- pnpm (`npm install -g pnpm@10.33.4`).
- Dependencies installed: `pnpm install` at the root.
- `apps/api/.env` copied from `apps/api/.env.example` (`cp apps/api/.env.example apps/api/.env`
  if it does not exist yet). Since the v2.1.0 kernel changes, `NODE_ENV` and `DATABASE_SSL`
  have no code default — the boot fails fast without them — and `.env.example` already sets
  both for local dev (`development` / `disable`). If an installed module declares its own
  required variable with no default (e.g. `identity`'s `BREACH_CHECK_ENABLED`), `module add`
  appends it to `.env.example` and it needs a real value before the app boots.
- Since the v3.0.0 kernel changes, storage vars are provider-neutral: `R2_*` no longer exists,
  and a local `.env` still declaring it just leaves storage unconfigured (boot succeeds; the
  first storage call throws `StorageUnavailable`). To keep testing file uploads locally,
  rename to `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` / `STORAGE_BUCKET` /
  `STORAGE_ENDPOINT` and add the now-explicit `STORAGE_REGION` — see `.env.example` and
  `docs/advisories/ADV-20260824-04.md` for `APP_TIMEZONE` and `docs/advisories/ADV-20260824-03.md`
  for the cookie-name escape hatch.

## Bring up the infra

```bash
docker compose up -d        # brings up postgres_dev (5432) and redis_dev (6379)
docker compose ps           # checks the status (healthy)
docker compose logs -f      # follows the logs
```

Credentials (match `apps/api/.env.example`):

| Service  | Port | Connection                                            |
| -------- | ---- | ----------------------------------------------------- |
| Postgres | 5432 | `postgres://devuser:devpassword@localhost:5432/devdb` |
| Redis    | 6379 | `redis://:redis@localhost:6379`                       |

## Prepare the database

With the containers up (Postgres `healthy`):

```bash
pnpm --filter api db:migrate:run   # applies drizzle/migrations (creates the _kernel schema etc.)
```

## Run the app

```bash
pnpm dev        # at the root — brings up api (3000) and web (5173)
```

## Useful compose commands

```bash
docker compose down       # stops the containers (keeps the data in the volumes)
docker compose down -v    # stops and DELETES the data (volumes postgres_data/redis_data)
docker compose restart    # restarts
```
