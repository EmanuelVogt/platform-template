# Ambiente de dev local

A app (`api` + `web`) roda no host via `pnpm dev`. A infra (Postgres + Redis)
roda em containers via Docker, definida no [`docker-compose.yml`](../../docker-compose.yml)
na raiz.

## Pré-requisitos

- Docker Desktop (com WSL2 habilitado no Windows).
- pnpm (`npm install -g pnpm@10.33.4`).
- Acesso ao registry privado do Bryntum (ver abaixo) — sem ele o `pnpm install` falha.
- Dependências instaladas: `pnpm install` na raiz.

### Registry privado do Bryntum

`@bryntum/scheduler` é licenciado e não está no npm público. O [`.npmrc`](../../.npmrc)
da raiz mapeia o escopo `@bryntum` para `https://npm.bryntum.com`, mas o token de
acesso **não** mora no repositório — cada máquina configura o seu.

Gere o token uma vez (vale ~27 anos) com a conta do
[Customer Zone](https://customerzone.bryntum.com). O login do registry é o e-mail
com `@` trocado por `..` (ex.: `user..example.com` para `user@example.com`), e o
`npm login` precisa de `--auth-type=legacy` — o fluxo via browser do npm ≥ 9 trava
contra esse servidor:

```sh
npm login --auth-type=legacy --registry=https://npm.bryntum.com
npm token create --registry=https://npm.bryntum.com
```

Grave o token no `.npmrc` do **usuário** (`~/.npmrc`, fora do repo):

```
//npm.bryntum.com/:_authToken=<token>
```

O pacote roda um `postinstall` que injeta a chave da licença no bundle (substitui
`%LICENSE%`). Ele está liberado em `onlyBuiltDependencies` no
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml); sem essa liberação o Scheduler
se comporta como não-licenciado.

CI e build de imagem recebem o mesmo token por secret — ver [`deploy.md`](./deploy.md).

**Subir o `api` em container** (`docker compose up -d --build api`) também exige o
token: essa imagem instala o workspace inteiro, e as dependências do `web` vêm junto.
Exporte `BRYNTUM_NPM_TOKEN` ou coloque no `.env` da raiz antes do build. Rodar a app
no host (`pnpm dev`) não precisa disso — o `pnpm install` já usa o seu `~/.npmrc`.

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
