# Testing — Handbook

Vitest 4, um projeto por app: `api` (Node + SWC, decorators do Nest) e `web` (jsdom + Testing
Library). As camadas de banco da api (`api-int`, `api-e2e`) sobem Postgres e Redis reais via
testcontainers. Vitest `projects` é o único runner do monorepo — nada fora dele (AD-028). Regras
de código: `docs/code-quality.md`.

Feito = `pnpm check && pnpm test:coverage` passando (com Docker ligado).

## Comandos

```bash
# raiz
pnpm test                     # unit dos dois apps (api, web) — sem Docker
pnpm test:watch                # watch mode
pnpm test:coverage             # os quatro projetos + relatório + piso de cobertura — precisa de Docker
pnpm vitest run --project api|web <path>   # roda um projeto/arquivo isolado, sem a suíte inteira

pnpm test:int                  # api integration, Postgres real — precisa de Docker
pnpm test:e2e                  # api e2e, Postgres real — precisa de Docker
pnpm test:db                   # test:int + test:e2e num container só

# raiz, só no repositório do template: o produto não recebe catalog/ nem estes scripts
pnpm test:scripts              node --test em scripts/platform/__tests__/*.test.mjs
pnpm catalog:lint              lint de catalog/** e docs/advisories/** (hook pre-commit)
pnpm catalog:typecheck         só compila as entradas (espelho staged, não roda spec nenhum)
pnpm catalog:check             único comando que instala e roda os testes de uma entrada
```

Saída de cobertura: `coverage/` (gitignored; relatórios `text`, `json-summary`, `html`, `lcov`).

## Layout

Teste ao lado do arquivo testado — sem `__tests__`, sem raiz de teste separada. A exceção é a
camada e2e da api: um teste que atravessa o app inteiro não tem um único arquivo pra sentar do
lado, então mora em `apps/api/test/`.

```
apps/api/
  vitest.config.mts        projeto "api"      — unit, src/**/*.spec.ts (inclui *.parity.spec.ts)
  vitest.int.config.mts    projeto "api-int"  — src/**/*.int-spec.ts
  vitest.e2e.config.mts    projeto "api-e2e"  — test/**/*.e2e-spec.ts, src/**/*.e2e-spec.ts, serial
  vitest.shared.mts        plugin SWC + defaults comuns aos três projetos da api
  test/setup/               ver §O harness da api

apps/web/
  vitest.config.ts         projeto "web" — src/**/<nome>.test.ts(x)

vitest.config.mts          raiz: projetos api + web, sem container, sem piso — pnpm test
vitest.coverage.mts        raiz: os quatro projetos + container + cobertura + pisos — pnpm test:coverage
vitest.integration.mts     raiz: api-int + api-e2e, pra uma rodada de banco isolada
```

`*.spec.ts` do projeto `api` também casa `*.parity.spec.ts` — os specs de paridade de uma entrada
do catálogo. `module add` copia esses specs pra dentro do módulo instalado; eles só rodam dentro de
um produto renderizado (`pnpm catalog:check`), nunca direto na raiz do template.

## O harness da api

`apps/api/test/setup/` existe pra nenhum teste escrever o próprio bootstrap.

- **`docker-runtime.ts`** — resolve o socket do runtime Docker ativo (Colima, Docker Desktop,
  Rancher); chamado primeiro em `global-setup.ts`, porque o testcontainers ignora o contexto do
  Docker CLI e procura o socket em caminhos fixos.
- **`global-setup.ts`** — roda uma vez por execução (não por projeto): sobe um container Postgres
  e um Redis, aplica as migrations reais, clona uma database por slot de worker
  (`CREATE DATABASE … TEMPLATE`) e publica as duas URIs via `project.provide()`. Sem um daemon
  Docker respondendo, a primeira etapa falha rápido com uma mensagem nomeando o comando certo —
  nunca trava esperando.
- **`container-uris.ts`** — lado do worker: `inject("postgresUri")` / `inject("redisUri")`.
  Rodar um spec de banco fora do projeto certo (ex.: `--project api` numa `*.int-spec.ts`) estoura,
  porque `inject()` volta `undefined`.
- **`test-db.ts`** — cada worker fala com o próprio banco, `test_w${VITEST_POOL_ID}` (o id do
  slot, `1..maxWorkers`, compartilhado por todos os projetos da execução — não só os quatro do
  `api-int`), clonado do banco migrado; as suítes truncam à vontade sem corrida.
- **`e2e-env.ts`** — trava IO externo antes do boot do app: `MAIL_TRANSPORT=log` e as credenciais
  de e-mail/R2 apagadas do env. O `.env` de dev carrega uma chave real e o dispatcher de entrega
  roda em background — sem essa trava, um fluxo que dispara e-mail enviaria de verdade.
- **`e2e-after-env.ts`** — `flushall` no Redis entre testes; a camada e2e roda serial e compartilha
  o mesmo Redis, então o estado de rate-limit precisa zerar a cada arquivo.

## As três camadas da api

| Camada | Escopo | Postgres |
| --- | --- | --- |
| unit `*.spec.ts` | uma classe, ou o grafo do módulo sem query | nenhum |
| integration `*.int-spec.ts` | um provider contra SQL real | testcontainers |
| e2e `*.e2e-spec.ts` | HTTP entra, resposta sai, pelo app real | testcontainers |

`vitest.integration.mts` sobe **um** container Postgres e um Redis em `globalSetup` e entrega as
URIs aos dois projetos por `provide`/`inject` — integration e e2e compartilham a mesma instância.
Mockar o banco em qualquer uma das duas camadas é proibido — é pra isso que existe a camada unit.

A camada integration roda paralela (`maxWorkers: 4`, um `test_w<N>` por worker); a e2e roda serial
(`fileParallelism: false`, `maxWorkers: 1`) — cada arquivo sobe o `AppModule` num fork de processo
novo (`isolate: true`, o default), então o heap não acumula entre arquivos.

## O que a configuração substitui

| Substituído | Por quê |
| --- | --- |
| stub de módulo pro `@scalar/nestjs-api-reference` | o pacote é ESM puro e carrega nativamente sob o SSR do Vite — sem stub, sem lista de exclusão de transform |
| canal de env pra URI dos containers (variável lida do processo) | `provide`/`inject` — nada em disco, nada herdado pelo processo filho |
| reciclagem de processo por arquivo na e2e | `isolate: true` (default) + `pool: "forks"` — fork novo por arquivo evita acúmulo de heap sem reciclar nada |
| relatório de cobertura por ferramenta externa | provider `v8` nativo do Vitest |

## Convenções

- `globals: false` em todo projeto — importe `describe`/`it`/`expect`/`vi` de `"vitest"`.
- Flags de reset de mock (`restoreMocks`/`clearMocks`/`mockReset`) ficam em `false` — os specs
  migrados foram escritos contra esses defaults; ligar é candidato a `test-suite-refactor`, não a
  esta migração.
- Sem mock de banco em integration/e2e — sempre testcontainers real.
- pt-BR em `describe`/`it`; identificador em inglês.
- No back, nunca `@/` em teste — só import relativo.
- No `web`, importe `@testing-library/jest-dom/vitest` pros matchers de DOM
  (`toBeInTheDocument`, …) — o nome do pacote é histórico, não indica o runner.

## Lint

`@workspace/eslint-config` inclui o conjunto de regras de teste (`@vitest/eslint-plugin`
`recommended` + doze regras de erro) em `*.spec.ts`, `*.int-spec.ts`, `*.e2e-spec.ts` e
`*.test.{ts,tsx}`. Falha o build em teste `.only`, `.skip`, sem assertion ou com título
duplicado; `max-nested-callbacks: 4`.

## Gate de pre-push

`lefthook.yml` roda `migrations → typecheck → catalog-typecheck → test-coverage` no `pre-push`
(o passo `catalog-typecheck` vive em `lefthook-local.yml`, fora da cópia do produto); qualquer
etapa vermelha — inclusive um piso de cobertura abaixo do calibrado — aborta o push.

`test-coverage` roda `pnpm test:coverage`: sobe Postgres e Redis em `globalSetup` e mede os
quatro projetos (`api`, `api-int`, `api-e2e`, `web`) numa passada só — por isso o pre-push e o CI
precisam de um daemon Docker. `pnpm test` fica só nos dois projetos unit, sem container e sem
piso, pro loop interno não depender de Docker.

## Exclusões de cobertura (tabela)

| Excluído | Por quê |
| --- | --- |
| `**/*.spec.ts`, `**/*.int-spec.ts`, `**/*.e2e-spec.ts`, `**/*.test.{ts,tsx}` | os próprios testes |
| `**/*.d.ts`, `**/*.fixture.ts` | sem lógica executável |
| `apps/api/src/main.ts` | bootstrap do processo |
| `apps/api/src/db/**` | scripts CLI |
| `apps/web/src/main.tsx` | bootstrap do processo |
| `**/shared/test/**` | harness de teste |
| `apps/api/test/**` | a e2e vive fora de `src/**` |

Pisos por glob, sem piso global: `apps/web/src/**` fixo em `{ statements: 64, branches: 56,
functions: 61, lines: 64 }`. `apps/api/src/**` é calibrado **uma vez**, a partir de uma medição
cheia da árvore migrada (−1,5 pt sobre o número medido), e depois só sobe — nunca desce
(AD-027). Números atuais: `docs/dev/template-changelog.md`.

## Performance

- `api`/`api-int` rodam com `maxWorkers: 4`; `api-e2e` roda serial (`fileParallelism: false`,
  `maxWorkers: 1`) com `isolate: true` — cada arquivo sobe num fork novo, então o heap não
  acumula entre arquivos.
- `VITEST_POOL_ID` é compartilhado por todos os projetos da execução (`1..maxWorkers` do
  projeto raiz) — o `globalSetup` clona `max(maxWorkers do root, de cada projeto)` databases,
  não só os quatro do `api-int`.
