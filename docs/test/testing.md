# Testing — Handbook

Guia operacional de testes do monorepo. Fonte da pirâmide: `docs/back/back-arch.md` (seção Testes). Este documento descreve o **setup real** (runners, testcontainers, convenções) e como escrever cada tipo de teste.

## Princípios

1. **Pirâmide, não ampulheta.** Muitos unit (rápidos, puros), integration suficientes (banco real), poucos e2e (caros).
2. **Sem mock de banco.** Integration e e2e rodam contra Postgres real (testcontainers). Mock de banco é proibido — esconde bug de SQL/migration/transação.
3. **Teste o comportamento, não a implementação.** Asserts sobre efeito observável (linha no banco, resposta HTTP, evento emitido), não sobre chamadas internas.
4. **pt-BR** nos `describe`/`it`. Identificador em inglês.
5. **Isolamento.** Cada teste parte de estado limpo (`truncateKernel` entre integration; container efêmero por suite).

## O que conta como prova

Regras confirmadas pelo loop de lições (`.specs/LESSONS.md`, promovidas por reincidência em features distintas). Valem para qualquer teste do monorepo, dentro ou fora do fluxo de spec:

- **Asserte o valor exato que o critério ou o título do teste promete.** `toBeDefined`, "o campo existe" e "não lançou" não são prova (L-007).
- **Cubra toda variante de entrada que o critério abrange** — conjunto misto, caminho alternativo, par de mesmo sentido. O caso representativo não prova os outros (L-004).
- **Asserte que um caminho de produção alcança o estado que dispara o comportamento.** Provar que o handler responde certo quando chamado não prova que ele roda (L-013).
- **Asserte valor que só existe como dado repassado adiante** — `style` inline, props de filho mockado. Sem assert, apagar o valor não quebra nada (L-010).

Lição nova nasce do Verifier, não daqui: `scripts/lessons.py` + [`.specs/lessons-vocabulary.md`](../../.specs/lessons-vocabulary.md).

## Pirâmide

| Tipo            | Escopo                                          | Banco            | Runner / sufixo                 |
| --------------- | ----------------------------------------------- | ---------------- | ------------------------------- |
| **Unit**        | função/classe pura (domain, VO, schema, helper) | nenhum           | jest `*.spec.ts` / vitest `*.test.ts` |
| **Integration** | `application` + `infrastructure` (repo, tx, outbox) | Postgres real | jest `*.int-spec.ts`            |
| **E2E**         | controller → use case → banco → outbox → handler | Postgres real   | jest `*.e2e-spec.ts`            |
| **Contract**    | facade exposta (snapshot do formato)            | nenhum           | jest `*.spec.ts`                |
| **OpenAPI**     | snapshot do `openapi.json` no CI                | —                | `pnpm contract` + `git diff`    |

## Runners

- **`apps/api` → jest + @swc/jest.** Transform sem typecheck (ordens de magnitude mais rápido que ts-jest); decorators via `legacyDecorator` + `decoratorMetadata` na config inline de cada config jest, `module.type: commonjs`. O tipo dos specs é garantido pelo `tsc --noEmit` (o tsconfig da api inclui `src/**` e `test/**`) — roda no pré-push e no CI.
- **`apps/web` → vitest + Testing Library + jsdom.** Nativo do ecossistema Vite; rápido; mesmo resolver de alias do app.

> No back **não** use o alias `@/` em código nem em teste — só imports relativos (o builder do Nest e o CommonJS do jest não reescrevem o alias em runtime).

## Estrutura e nomenclatura

```
apps/api/
├── src/**/<nome>.spec.ts          Unit — ao lado do código
├── src/**/<nome>.int-spec.ts      Integration — ao lado do código
├── test/
│   ├── <fluxo>.e2e-spec.ts        E2E — boot do app + supertest
│   ├── jest-integration.json      config jest dos *.int-spec
│   ├── jest-e2e.json              config jest dos *.e2e-spec
│   └── setup/
│       ├── global-setup.ts        sobe container + aplica migrations
│       ├── global-teardown.ts     derruba container
│       ├── e2e-env.ts             aponta DATABASE_URL p/ o container (e2e)
│       ├── test-db.ts             pool/drizzle de teste + truncateKernel
│       └── test-logger.ts         LoggerFactory silencioso p/ instanciar kernel

apps/web/
├── src/**/<nome>.test.ts(x)       Unit/componente — ao lado do código
├── vitest.config.ts
└── test/setup.ts                  matchers jest-dom
```

`*.spec.ts` (unit) roda no `pnpm test` e **ignora** `*.int-spec.ts`/`*.e2e-spec.ts` (eles exigem Docker).

## Comandos

```
# apps/api
pnpm --filter api test        unit (rápido, sem Docker)
pnpm --filter api test:int    integration (testcontainers)
pnpm --filter api test:e2e    e2e (testcontainers)
pnpm --filter api test:all    unit + int + e2e

# apps/web
pnpm --filter web test        vitest (jsdom)

# raiz
pnpm test                     turbo: roda o `test` (unit) de cada app
```

`test:int` roda **paralelo** (`maxWorkers: 4`): cada worker usa um database próprio (`test_w<N>`, clone do DB migrado via `CREATE DATABASE ... TEMPLATE`), então suítes truncam à vontade sem corrida. `test:e2e` roda **serial** (`maxWorkers: 1`) — o app boota no DB base e as suítes compartilham Redis (estado de rate-limit).

**Nada de `--runInBand` no e2e.** Serialização já vem do `maxWorkers: 1`; o `--runInBand` só remove o worker filho, e é ele que segura a memória. Cada arquivo e2e boota o `AppModule` num realm novo, e o jest-circus retém a árvore de describe/hook do arquivo — o closure do `beforeAll` segura o app Nest inteiro. `app.close()` solta socket e timer, **não** o grafo de objetos. In-band os realms se acumulam num processo só: ~3,5 GB no fim do tier sem coverage (teto default do Node é ~4 GB) e OOM com coverage, que ~triplica o custo por arquivo. Em worker, o `workerIdleMemoryLimit` (`1.5GB`, no `jest-e2e.json`) recicla o processo entre arquivos e o pico fica limitado. Detalhe: `shouldRunInBand` do jest só respeita o `workerIdleMemoryLimit` quando `--runInBand` está ausente.

## testcontainers — como funciona

1. `global-setup.ts` sobe `postgres:16-alpine`, aplica as migrations reais (`drizzle-orm/.../migrator`) e publica a URI em `process.env.TC_POSTGRES_URI` (Redis idem, em `TC_REDIS_URI`).
2. Workers herdam esse env no fork e leem pelos helpers de `test/setup/container-uris.ts` (`globalThis` não atravessa processo; env atravessa). Como o handshake é por processo e não por arquivo em disco, **dois runs simultâneos no mesmo checkout não se atropelam** — cada um fala só com os próprios containers.
3. `global-teardown.ts` derruba o container (o reaper do testcontainers cobre falhas).
4. Entre testes, `truncateKernel(pool)` zera o schema `_kernel`.

Exige **Docker** na máquina e no CI. Cada `test:int`/`test:e2e` é uma suite com um container.

**Runtime em VM (Colima, Docker Desktop, Rancher):** nada a configurar. O
testcontainers procura o socket em caminhos fixos e ignora o contexto do Docker
CLI — daí o "Could not find a working container runtime strategy" mesmo com o
`docker` respondendo. `test/setup/docker-runtime.ts` resolve o socket pelo
contexto ativo e aponta o bind mount do Ryuk para `/var/run/docker.sock` (o
caminho que vale dentro da VM; sem isso o reaper morre no mount e a alternativa
seria desligá-lo, vazando Postgres/Redis quando a suíte é morta). `DOCKER_HOST`
ou `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` vindos do ambiente sempre vencem, e
com daemon nativo (Linux/CI) a detecção é no-op.

## Unit

Puro, sem IO. Instancie e asserte o efeito.

```typescript
// src/shared/config/env.spec.ts
import { parseEnv } from "./env"

it("falha (fail-fast) sem DATABASE_URL", () => {
  expect(() => parseEnv({})).toThrow(/DATABASE_URL/)
})
```

Para o que é privado (ex.: `hashRequest`), extraia uma função pura exportável ou teste pelo comportamento público — não exponha interno só para o teste sem necessidade.

## Integration (banco real)

Instancie as classes do kernel **manualmente** (sem o container DI do Nest) com o pool de teste e o `makeTestLogger`. Use `TransactionManager.run` para abrir tx.

```typescript
// src/shared/kernel/transactional/transaction-manager.int-spec.ts
beforeAll(() => {
  pool = createTestPool()
  db = createTestDb(pool)
  txm = new TransactionManager(db, makeTestLogger().loggerFactory)
})
afterAll(async () => { await pool.end() })
beforeEach(async () => { await truncateKernel(pool) })

it("faz rollback quando o run lança", async () => {
  await expect(
    txm.run(async () => { await insert("e2"); throw new Error("boom") })
  ).rejects.toThrow("boom")
  expect(await ids()).toEqual([])
})
```

Cubra as invariantes críticas: commit/rollback, join vs `requires_new` (savepoint), `onCommit`, dedupe (`markIfNew`), reclaim de idempotência por expiração, retry/dead-letter do outbox.

Para exercitar o dispatcher sem esperar o poll, registre um listener no `EventEmitter2` e chame `dispatcher.poll()` direto (método público).

## E2E

Boot do `AppModule` real via `@nestjs/testing` + `supertest`, contra o container. Espelhe o setup do `main.ts` (versioning + middleware de contexto).

```typescript
// test/health.e2e-spec.ts
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
  app.use(createRequestContextMiddleware(app.get(RequestContext)))
  await app.init()
})
afterAll(async () => { await app.close() })   // fecha pool + LISTEN client + intervals

it("rota inexistente → 404 RFC 7807 com correlationId do header", async () => {
  const res = await request(app.getHttpServer())
    .get("/v1/nope").set("X-Correlation-Id", "corr-e2e").expect(404)
  expect(res.headers["content-type"]).toContain("application/problem+json")
  expect(res.body.correlationId).toBe("corr-e2e")
})
```

`e2e-env.ts` define `DATABASE_URL` (container), `NODE_ENV=test`, `LOG_LEVEL=silent` antes do boot. Sempre `app.close()` no `afterAll` — senão o pool/LISTEN client/intervals vazam handles.

**IO externo nunca é real no e2e.** O `e2e-env.ts` força `MAIL_TRANSPORT=log` (LogMailer) e apaga `RESEND_API_KEY`/`MAIL_FROM` — o `.env` de dev usa `MAIL_TRANSPORT=resend` com **chave REAL**, e o `DeliveryDispatcher` roda em background (`@Interval`), então um fluxo que dispara e-mail (create-user, forgot-password, lockout) **enviaria de verdade** sem essa trava. Mesma lógica do R2 (credenciais dummy). Pra **asseverar** o efeito de um envio, dê `.overrideProvider(MAILER).useValue(fake)` no `Test.createTestingModule` (idem `OBJECT_STORAGE` p/ storage) — nunca confie no provider real nem em lembrar do override por teste: a trava do `e2e-env` é a rede de segurança.

## Contract / OpenAPI snapshot

- **Contract de facade:** quando houver facade pública entre módulos, snapshot do formato que cada consumidor espera (`*.spec.ts`, sem banco).
- **OpenAPI:** o CI roda `pnpm contract` e falha se `openapi.json` divergir (`git diff --exit-code openapi.json`). Mudou contrato → regerar e commitar.

## Web (vitest + RTL)

```typescript
// schema puro
import { loginSchema } from "./login.schema"
it("rejeita e-mail inválido", () => {
  expect(loginSchema.safeParse({ email: "nope", password: "x", rememberMe: false }).success).toBe(false)
})

// componente
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
render(<Greeting name="Mundo" />)
expect(screen.getByText("Olá, Mundo")).toBeInTheDocument()
```

Import explícito de `vitest` (`describe`/`it`/`expect`) — sem `globals`, para não mexer no tsconfig do web. Forms que dependem de router/query: envolva nos providers mínimos.

## CI

```
1. pnpm check               lint + typecheck (todos pacotes)
2. pnpm --filter api test   unit (sem Docker)
3. pnpm --filter web test   vitest
4. [Docker] pnpm --filter api test:int
5. [Docker] pnpm --filter api test:e2e
6. pnpm --filter api contract && git diff --exit-code openapi.json
```

`test:int`/`test:e2e` exigem um runner com Docker (testcontainers).

## Anti-padrões

- Mock de banco em integration/e2e (use testcontainers).
- Asserts em chamadas internas / spies onde dá pra checar o efeito observável.
- `@/` em teste do back (use relativo).
- Esquecer `app.close()` no e2e (vaza handles).
- Teste integration sem `truncate` entre casos (vaza estado).
- Espera baseada em clock do JS pra efeito gravado pelo Postgres (`new Date()` vs `now()` — precisão ms vs µs; compare no SQL).
- e2e sem Docker no CI marcado como obrigatório no pipeline rápido (separe o estágio).

## Onde criar o teste

```
Regra pura (domain, VO, schema, helper)?     → <nome>.spec.ts ao lado (api) / <nome>.test.ts (web)
Repo / tx / outbox / idempotência (banco)?   → <nome>.int-spec.ts ao lado
Fluxo HTTP ponta a ponta?                     → test/<fluxo>.e2e-spec.ts
Componente React?                             → <nome>.test.tsx ao lado
Facade pública entre módulos?                 → <facade>.spec.ts (snapshot de contrato)
Decisão estrutural de teste (exceção)?        → docs/adr/NNNN-titulo.md
```
