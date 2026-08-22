# Backend — Arquitetura

Handbook único do `apps/api`: heurísticas do dia a dia e referência técnica num documento só (absorveu a antiga `referencia-tecnica.md`). Descreve **o que existe no disco**; onde há alvo ainda não atingido, o texto diz explicitamente. Decisão pontual mora em `docs/adr/`; regras cross-cutting de código em [`docs/code-quality.md`](../code-quality.md); testes em [`docs/test/testing.md`](../test/testing.md). Retrato datado de conformidade: [`auditoria-arquitetural-2026-08.md`](auditoria-arquitetural-2026-08.md).

## Princípios

1. **Monolito modular** — módulos com fronteiras rígidas, verificadas por trava (`module-boundaries.spec.ts`).
2. **Um arquivo, uma responsabilidade** — 1 controller/rota, 1 use case/operação.
3. **Zod = fonte da verdade do contrato HTTP.**
4. **Domínio isolado** — entidades nunca cruzam módulos.
5. **Ports & adapters** — `application/` depende de interface; `infrastructure/` implementa.
6. **Comunicação explícita** — facade (síncrono) ou evento via outbox (assíncrono).
7. **Contexto implícito** — `RequestContext` por ALS, nunca na assinatura.
8. **Transação consciente** — `@Transactional`, nunca `db.transaction` à mão.
9. **Outbox transacional** — evento gravado na mesma tx do agregado.
10. **Idempotência por desenho** — `@Idempotent` em rota mutável com efeito externo; dedupe por `processed_events` no consumer.
11. **Observabilidade desde o boot** — log estruturado correlacionado + tracing.
12. **Frontend consome código gerado** (Kubb) — nunca cliente HTTP à mão.

## Mapa de `src/`

```
apps/api/src/
├── main.ts                  bootstrap HTTP
├── app.module.ts            root module (módulos + providers globais)
├── tracing.bootstrap.ts     OTel antes de tudo (primeira linha do main.ts)
├── shared/
│   ├── kernel/              19 pastas — infraestrutura de arquitetura (abaixo)
│   ├── infra/               database, redis, storage
│   └── config/              env.ts (Zod das env globais) + load-dotenv
├── modules/                 entradas do catálogo instaladas (`module add`) + módulos de
│                            negócio do produto (estrutura abaixo); no template puro só
│                            `module-boundaries.spec.ts`
├── platform-modules.ts      gerado do `.platform-modules.lock` — `PLATFORM_MODULES` (abaixo)
├── db/                      scripts de operação: migrate, check-journal, outbox-replay
├── seeds/                   seed master/demo (script ts-node; escreve em tabela de entrada/módulo)
├── openapi/                 export-openapi + openapi-config + 4 specs de conformidade
├── legacy-import/           backfills + sync contínuo do legado (runtime, ADR 0044/0052)
└── docs/                    monta `/docs` (Scalar sobre o `openapi.json`); sem autenticação, sem
                             depender de módulo (ver receita de login em `docs/dev/template.md`)
```

Três regimes convivem em `src/` e têm regras diferentes:

| Regime | Quem | Regras |
| --- | --- | --- |
| Runtime Nest | `modules/`, `shared/`, `legacy-import/sync/`, `docs/` | camadas + fronteiras + travas |
| Script CLI | `db/`, `seeds/`, `openapi/export-openapi.ts`, `legacy-import/run.ts`, `legacy-import/tools/` | roda fora do grafo de módulos; pode importar tabela de módulo; `console` permitido (fala com o terminal) |
| Conformidade | os `*.spec.ts` de invariante (ver §Travas) | precisam morar sob `src/` (o `include` do projeto `api` do vitest) |

**Exceção escrita à Regra de Ouro 5:** código fora de `src/modules/` que roda fora do request (seed, backfill, sync do legado) pode importar e escrever tabela de módulo. O `legacy-import/` é **o único escritor autorizado em tabela alheia em runtime** (ADRs 0044/0052; condição de saída = decisão D2 da 0052). A Regra 5 governa `modules/*`.

## `shared/kernel/` — 19 pastas

Raiz: `kernel.schema.ts` (`pgSchema("_kernel")`) e `shared-kernel.module.ts` (agregador `@Global`, importado **só** pelo `AppModule` — módulo de negócio **não** importa nada do kernel via `imports:`; os providers chegam pelo container). `AuditTrailModule`, `HealthModule` e `CoexistenceModule` sobem por fora, direto no `AppModule` (o Coexistence de propósito: o guard dele registra depois dos quatro do identity).

| Pasta | O que é |
| --- | --- |
| `access/` | catálogo de permissões em código (4 catálogos) + decorators de acesso (ADR 0028) |
| `audit/` | trilha de auditoria por trigger: repository, cobertura (`audit-coverage.ts`), purge (ADRs 0041/0047/0049) |
| `clock/` | port `CLOCK` + `SystemClock` + helpers de bucket SQL — tempo injetável |
| `coexistence/` | modos legado/novo por domínio: `LegacyWriteGateGuard` + controller (ADR 0052) |
| `collections/` | utilitários puros (`set-equal`) |
| `context/` | `RequestContext` (ALS) + middleware HTTP + builders de contexto de evento e de job |
| `database/` | `pg-errors.ts` — mapeamento de erro do driver pg (`isUniqueViolation` etc.) |
| `domain/` | `entity-props.ts` — base da entidade imutável (Regra 29) |
| `errors/` | `DomainError`, `ProblemDetailsFilter` (RFC 7807), `ForbiddenError` (403 único) + trava de namespace |
| `events/` | `DomainEvent` base + contratos cross-module (`notification.requested`, `tag.purged` — ADR 0025) |
| `health/` | `GET /health` e `GET /ready` |
| `http/` | helpers de borda HTTP compartilhados (`content-disposition`) |
| `idempotency/` | `@Idempotent` + interceptor + `_kernel.idempotency_keys` + cleanup |
| `listing/` | sistema de listagem: paginação, ordenação, filtro, `PaginatedResult` (ADR 0017) |
| `logging/` | `LoggerFactory`/`AppLogger` (pino), interceptor de request, redaction, serializers |
| `outbox/` | publisher, dispatcher, `_kernel.outbox`/`outbox_dead`/`processed_events` |
| `scheduling/` | runtime de **manutenção**: `@MaintenanceJob`, advisory lock, schedule central com `lockId` (ADR 0024). Não confundir com `modules/scheduling` (agenda de negócio) |
| `tracing/` | OTel setup, `@Traced`, propagação `traceparent` no envelope |
| `transactional/` | `TransactionManager` + `@Transactional`/`@ReadOnly` |
| `use-case/` | `UseCase<I,O>` + `@UseCase` |

`shared/infra/`: `database/` (provider drizzle + `schema.ts` agregador; tokens `DRIZZLE`/`PG_POOL` **privados ao kernel** — módulo de negócio nunca injeta, só via `TransactionManager.getExecutor()`/`outsideTransaction()`; `DedicatedClientFactory` cria `pg.Client` avulso, fora do pool, para infra de longa duração — ADR 0089), `redis/` (`REDIS_CLIENT`), `storage/` (`ObjectStoragePort` + adapter R2, token `OBJECT_STORAGE`). `shared/config/`: schema Zod das env globais, validado no boot.

## Portas do kernel

Onde uma entrada do catálogo precisa de algo que outra entrada implementa e um ciclo de
dependência apareceria, o kernel hospeda o par token+interface ao lado do conceito — nunca
numa árvore `ports/` separada:

| Porta | Onde | O que declara |
| --- | --- | --- |
| `ACCESS_POLICY` | `shared/kernel/access/access-policy.port.ts` | `AccessPolicy.can(actor, requirement)` — o `AccessGuard` global (ver `access/`, acima) resolve essa porta; sem provider ligado, toda rota não-pública responde 403 `access-policy-missing` |
| `PROFILE_IMAGE_STORE` | `shared/kernel/profile-image/profile-image-store.port.ts` | porta de imagem de perfil entre entradas |
| `AUDIT_TRAIL_PURGER` | `shared/kernel/audit-trail/audit-trail-purger.port.ts` | porta de purga da trilha de auditoria entre entradas |

Toda outra aresta entre entradas é declarada em `dependsOn` (`module.json` da entrada),
sem porta — porta existe só onde há ciclo.

**Ator e extensions no `RequestContext`** (`shared/kernel/context/request-context.ts`):
`setActor(actor: Actor)`/`getActor(): Actor | null` (um `setActor` por requisição; segunda
chamada lança) e `setExtension<T>(key: symbol, value: T)`/`getExtension<T>(key: symbol):
T | undefined` — bag chaveado por symbol onde cada entrada guarda o que só ela precisa (ex.:
o conjunto de permissões resolvido) sem o kernel conhecer a forma do dado. No contexto de
job, o campo vira `actorId: string | null` (não o ator inteiro).

## Entrada do catálogo (anatomia)

Uma entrada do catálogo instalada (`module add`) ou um módulo de negócio do produto vivem
lado a lado em `apps/api/src/modules/`, com o mesmo layout de camadas abaixo. O
`<entry>.module.ts` de cada entrada instalada é o símbolo importado por
`apps/api/src/platform-modules.ts` — o registro **gerado** a partir do
`.platform-modules.lock` que substitui a lista manual de módulos de plataforma no
`AppModule` (`imports: [...kernelModules, ...PLATFORM_MODULES, ...productModules]`); nunca
editado à mão, regenerado a cada `module add`/`module adopt`. **Comunicação entre entradas
é só facade (síncrono) ou evento via outbox (assíncrono)** — mesma regra do Princípio 6,
agora também o único jeito de uma entrada declarar `dependsOn` outra; import direto de
`domain/`/`infrastructure/` de outra entrada reprova a trava de fronteira (RULE C,
`module-boundaries.spec.ts` — vocabulário de uma entrada só existe dentro dela mesma e em
`docs/catalog/**`).

```
modules/<entry>/
├── <entry>.module.ts              providers + exports (só facades)
├── <entry>.config.ts              Zod das env vars da entrada/módulo; validado no boot
├── api/
│   ├── controllers/               1 controller por rota; módulo grande agrupa por
│   │   └── <contexto>/            contexto, com CONTROLLERS[] por contexto/topo
│   ├── contracts/                 <resource>.contract.ts (Zod + DTOs)
│   ├── guards/ decorators/        borda HTTP de auth (csrf, rate-limit) — ADR 0005
│   └── facades/                   <operation>.facade.ts — superfície pública entre módulos
├── application/
│   ├── use-cases/<action>/        layout padrão: use-case.ts + types.ts
│   ├── <agregado>/                layout legado em 7 módulos (ver nota abaixo)
│   ├── views.ts                   camada de mapeamento (funções puras) — ver §Views
│   ├── event-handlers/
│   │   ├── external/              eventos de outros módulos
│   │   └── internal/              eventos do próprio módulo (saga)
│   ├── jobs/                      <name>.job.ts — jobs @MaintenanceJob do módulo
│   ├── services/                  application service @Injectable (ADR 0026)
│   └── <orquestração>.ts          guards de orquestração cross-module (ver nota)
├── domain/
│   ├── entities/                  <resource>.entity.ts
│   ├── ports/                     <resource>.repository.ts + tokens (§Nomenclatura)
│   ├── value-objects/             quando houver VO
│   ├── engine/                    regra pura de motor (só o scheduling hoje)
│   └── errors.ts                  DomainError do módulo (TYPE_BASE = nome do módulo)
└── infrastructure/
    ├── repositories/              drizzle-<resource>.repository.ts (+ persistence-mapper)
    ├── tables/                    <module>.schema.ts (pgSchema) + <resource>.table.ts
    ├── events/                    contrato de evento do módulo (consumidor único)
    └── <concern>/                 hashing/, mailer/, realtime/… (1 pasta por adapter)
```

Pastas só existem quando há conteúdo — sem pasta vazia.

**Dois layouts de use case convivem (decisão AD-012).** O padrão é `application/use-cases/<action>/`; um conjunto de módulos herdado de antes da convenção usa `application/<agregado>/<action>.use-case.ts`. Regra: **módulo/entrada novo nasce com `use-cases/`; módulo existente segue o layout local** — migrar os arquivos legados não paga o conflito com branches em voo. Trava nova que varra use case precisa cobrir os dois globs (o `transactional-coverage` já cobre).

**Arquivos soltos na raiz de `application/` são uma categoria nomeada:** *guard de orquestração cross-module* — recebe a facade de outro módulo/entrada, pergunta um fato e lança erro de domínio. É legítimo. O que **não** fica ali: regra pura sem I/O (vai para `domain/` — entidade, `engine/` ou arquivo de domínio) e serviço `@Injectable` reutilizável (vai para `services/`, ADR 0026). Helper privado de um use case mora na pasta da ação; quando um segundo use case precisa dele, gradua para `services/`.

**Módulos Nest secundários (leaf, padrão OHS).** Ciclo entre módulos não se resolve com `forwardRef` — extrai-se um módulo-folha que os dois lados importam. O leaf declara o binding único dos repositórios e exporta a facade; os tokens de `PORTS` exportados existem para o módulo pai injetar o mesmo binding — **não** são convite para injeção alheia (a trava de fronteira barra o import do port). Inversão por registry é uma exceção documentada por ADR quando ocorrer.

## Camadas

| Camada | Conhece | Não conhece |
| --- | --- | --- |
| `api/` | application, contracts, **`domain/ports` (tipos e tokens)**, domain/errors | `domain/entities`, infrastructure |
| `application/` | domain, `ports/`, contracts (tipos via `z.infer`) | infrastructure (exceto `infrastructure/events/` do próprio módulo) |
| `domain/` | só o próprio `domain/` + `shared/kernel` | resto |
| `infrastructure/` | domain, `ports/` (implementa) | application, api do próprio módulo |

- `shared/*` é acessível de qualquer camada (kernel e infra compartilhada são o chão comum). `domain/` só alcança `shared/kernel`.
- Cross-module: o único alvo permitido é `api/facades/` do outro módulo (de qualquer camada — repositório-adapter que delega à facade alheia é padrão aceito) e o wiring de módulo Nest (`*.module.ts` importa `*.module.ts`).
- **A tabela é executável:** `src/modules/module-boundaries.spec.ts` resolve todo import relativo de produção e reprova travessia fora da regra. Exceção nova só entra na allowlist do spec **com motivo escrito**; entrada morta reprova.

## Nomenclatura

```
<action>.controller.ts             pay-invoice.controller.ts
<action>.use-case.ts               pay-invoice.use-case.ts   (+ types.ts na pasta)
<operation>.facade.ts              get-invoice-summary.facade.ts
<event-name>.handler.ts            invoice-paid.handler.ts
<event-name>.event.ts              invoice-paid.event.ts
<resource>.entity.ts               invoice.entity.ts
<resource>.repository.ts           port em domain/ports/ (SEM sufixo .port)
drizzle-<resource>.repository.ts   adapter em infrastructure/repositories/
<x>.port.ts                        port NÃO-repositório (mailer, hasher, dispatcher…)
<x>.reader.ts                      port de leitura composta
<resource>.contract.ts             Zod/DTOs (api/)
<resource>.table.ts                Drizzle (infrastructure/tables/)
<module>.schema.ts                 pgSchema do módulo (infrastructure/tables/)
views.ts                           mapeamento do módulo (application/)
<name>.job.ts                      job de manutenção (application/jobs/)
```

O port de repositório **não** leva sufixo `.port` (convenção real, 62 de 73 arquivos — AD-012); o caminho já distingue port (`domain/ports/`) de adapter (`infrastructure/repositories/`, com prefixo do driver).

### Identificadores de banco (Postgres)

Regra-mãe: **schema nomeia o conceito (singular); tabela é coleção (plural)**.

| Identificador | Forma | Exemplo |
| --- | --- | --- |
| schema / módulo | **singular** snake_case | `identity`, `attachment`, `_kernel`, `_sync` |
| tabela | **plural** snake_case | `users`, `sessions`, `notification_deliveries` |
| coluna | singular snake_case | `email`, `created_at`, `storage_key` |
| foreign key | `[<papel>_]<entidade_singular>_id` | `owner_user_id`, `avatar_attachment_id` |
| enum type | `<entidade>_<atributo>` singular | `attachment_status` |
| índice | `<tabela>_<colunas>_idx`; partial/expression pode usar `<tabela>_<intent>_idx` | `sessions_user_id_idx` |

**Exceção pattern/mass-noun:** `outbox`/`outbox_dead` ficam singular ("outbox" nomeia o pattern). Outra tabela claramente pattern → justificar no PR. Satélites do mesmo agregado podem compartilhar o arquivo `.table.ts` da raiz (prática aceita).

## Controller

```typescript
@ApiTags("invoices")
@Controller("invoices")
export class PayInvoiceController {
  constructor(private readonly useCase: PayInvoiceUseCase) {}

  @Post(":id/pay")
  @RequirePermission("billing.invoices.write")
  @Idempotent({ ttlHours: 24 })
  @ApiOperation({ operationId: "payInvoice" })
  @ApiOkResponse({ type: PayInvoiceResponseDto })
  async handle(@Param() params: PayInvoiceParamsDto, @Body() body: PayInvoiceBodyDto) {
    return this.useCase.execute({ params, body })
  }
}
```

- **Forma curta.** O `/v1` vem do boot (`enableVersioning({ defaultVersion: "1" })` no `main.ts`) — nenhum controller de módulo declara `version`. `VERSION_NEUTRAL` só no health (kernel).
- `operationId` é **nome público de contrato** (chave de tudo que o Kubb gera): camelCase da ação, sem prefixo de controller nem sufixo de versão. Guia: nome do arquivo em camelCase (`pay-invoice.controller.ts` → `payInvoice` → `usePayInvoice` no front). Sempre explícito. Invariantes por teste: `src/openapi/operation-id.spec.ts` (presença/unicidade/convenção) e `test/openapi-contract.e2e-spec.ts` (drift vs `openapi.json`). Mudar id é breaking deliberado no front. Ver ADR 0027.
- Tag OpenAPI: uma por módulo, lowercase plural.
- Toda rota declara **exatamente um** modo de acesso (§Autorização) — trava `authz-coverage`.
- `@Idempotent` em rota mutável com efeito externo (§Idempotência).
- Rota interna fora do OpenAPI (`@ApiExcludeEndpoint`): SSE (o Kubb tentaria parsear event-stream) e endpoint por token compartilhado (ADR 0074).

## Autorização (authz)

Catálogo de permissões em código no kernel (`shared/kernel/access/`): módulos → features → chaves com `requires`; o banco guarda só as chaves. Toda rota declara **um** modo:

| Decorator | Semântica |
| --- | --- |
| `@Public()` | sem sessão e sem permissão (login, reset, health) |
| `@SelfService()` | exige sessão, não exige permissão (sessão, devices, feed) |
| `@OptionalAuth()` | popula `userId` se houver cookie; ACL do use case decide |
| `@RequirePermission(...k)` | exige TODAS as chaves (AND); master bypassa |

**Cinco guards globais**, na ordem: `RateLimit → Auth → Csrf → Permissions` (registrados no IdentityModule) e `LegacyWriteGate` (CoexistenceModule, registrado depois — barra write em domínio ainda de dono legado). O `PermissionsGuard` é fail-closed: rota sem declaração → 403; antes do runtime, `src/openapi/authz-coverage.spec.ts` reprova rota sem declaração ou com declaração dupla. Perfil de acesso classifica e define piso/home; quem concede é o set por usuário. Ver ADR 0028. Auth é **sessão stateful** (cookie + lookup no DB), não JWT — ADR 0005.

## Use case

```typescript
@UseCase()
export class PayInvoiceUseCase implements UseCase<PayInvoiceInput, PayInvoiceOutput> {
  private readonly log: ScopedLogger

  constructor(
    loggerFactory: LoggerFactory,
    private readonly ctx: RequestContext,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    private readonly outbox: OutboxPublisher,
  ) {
    this.log = loggerFactory.forModule(PayInvoiceUseCase.name)
  }

  @Transactional()
  @Traced({ name: "PayInvoiceUseCase" })
  async execute(input: PayInvoiceInput): Promise<PayInvoiceOutput> {
    const { userId } = requireAuth(this.ctx)
    const invoice = await this.invoices.findById(input.params.id)
    if (!invoice) throw new InvoiceNotFoundError(input.params.id)

    const paid = invoice.pay({ payerId: userId })
    await this.invoices.save(paid)
    await this.outbox.publish(InvoicePaidEvent.from({ invoice: paid, payerId: userId }))
    return toInvoiceView(paid)
  }
}
```

| Quando | Decorator |
| --- | --- |
| Sempre | `@UseCase` |
| Muta ≥1 repo | `@Transactional` |
| Só leitura | `@ReadOnly` |
| Sempre (no execute) | `@Traced` |
| Rota mutável com efeito externo (no controller) | `@Idempotent` |

Checagem repetida entre use cases do módulo (`if (!userId) throw`) vira **um** helper de application (`require-auth.ts`, `require-caller.ts`) com semântica de erro única — defesa em profundidade DRY, não a checagem primária (o guard já barrou).

## Views (mapeamento)

O mapeamento entidade → shape de resposta mora em **`application/views.ts`** — funções puras, sem DI (convenção real: 13 de 18 módulos; AD-012). Mapper `@Injectable` em `application/mappers/` é a **exceção** para quem precisa de DI (locale, feature flag, i18n — caso do notification). Módulo grande pode fatiar em `<recurso>.views.ts`. O *persistence mapper* (row ↔ entidade) é outra coisa: função pura junto do repository em `infrastructure/repositories/`.

Regra: view/mapper transforma, não decide regra de negócio.

## Port + adapter

```typescript
// domain/ports/invoice.repository.ts
export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>
  save(entity: Invoice): Promise<void>
}
export const INVOICE_REPOSITORY = Symbol("INVOICE_REPOSITORY")

// infrastructure/repositories/drizzle-invoice.repository.ts
@Injectable()
export class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(private readonly tx: TransactionManager) {}
  private get db() { return this.tx.getExecutor() }

  findById(id: string) { /* select…; PersistenceMapper.toDomain */ }
  save(entity: Invoice) { /* PersistenceMapper.toPersistence; upsert */ }
}

// <module>.module.ts
providers: [{ provide: INVOICE_REPOSITORY, useClass: DrizzleInvoiceRepository }]
```

Repository **nunca** recebe `tx` na assinatura — lê do `TransactionManager`. Nunca devolve row crua — sempre entidade via persistence mapper.

## RequestContext (ALS)

Store real (`shared/kernel/context/request-context.ts`):

| Campo | Origem |
| --- | --- |
| `origin` | `"http" \| "event" \| "job" \| "backfill"` — quem abriu o contexto |
| `requestId` | ULID gerado pelo middleware |
| `correlationId` | header `X-Correlation-Id` **se for ULID válido** (normalizado uppercase); senão = `requestId` |
| `causationId` | `eventId` do evento pai (em handler); senão null |
| `traceId` / `spanId` | OTel |
| `tenantId` | null hoje (espaço para multi-tenant) |
| `userId` / `sessionId` / `deviceId` | `setUserSession` no `AuthGuard` (one-shot; re-set idêntico tolerado) |
| `access` | `{ permissions, isMaster }` — `setAccess` no `PermissionsGuard` (one-shot; segunda chamada lança) |
| `locale`, `ip`, `userAgent`, `startedAt` | middleware |

O store é readonly no tipo; `setUserSession`/`setAccess` são as duas exceções controladas (ADR 0016). Leitura: `ctx.get()` (lança fora de escopo) ou `ctx.tryGet()`.

**Todo dispatcher abre o contexto antes de trabalhar** — `buildEventContextStore(envelope)` (herda `correlationId`, `causationId = eventId`, `origin: "event"`) no dispatcher do outbox; `buildJobContextStore({ correlationId, userId })` (`origin: "job"`) em dispatcher de job. Sem isso, `ctx.get()` lança, o log perde correlação e a auditoria perde o ator. Unit test com facade mockada não pega essa exigência — o guarda é int-spec do dispatcher com use cases reais.

**Nunca** receber `userId`/`correlationId`/`tenantId` na assinatura — vem do ALS.

## Comunicação entre módulos

### Síncrona — facade

`api/facades/<operation>.facade.ts`, exportada no `<module>.module.ts`; o consumidor importa o **módulo Nest** e injeta a facade. **Default = facade.**

- **Facade reexporta todo tipo que devolve** (`export type { GuestRef } from …`) — consumidor nunca faz deep import em port/use case alheio, nem para tipo. A trava barra.
- **Facade devolve DTO/ref, nunca a entidade de domínio** (Regra 2 vale para facade: entregar a entidade dá ao vizinho os métodos de transição e acopla no shape interno).
- **Facade compartilha a tx do chamador** — não abre `@Transactional` próprio; a atomicidade é do use case que chama (o gate transacional o obriga). Facade que escreve existe (consumo de crédito) e segue esta regra.
- **Leitura por item dentro de laço pede variante em lote** na facade do dono (`findByIds`, `consumeMany`) — facade unitária em loop é N+1 cruzando fronteira.

### Assíncrona — evento via outbox

Contrato de evento: **`modules/<module>/infrastructure/events/` quando só o próprio módulo (ou um consumidor) o consome; `shared/kernel/events/` quando >1 módulo consome** (regra da ADR 0025 — ex.: `tag.purged`, consumido por activity e service). Só a base `DomainEvent` é sempre do kernel.

```typescript
export interface InvoicePaidPayload {
  invoiceId: string
  orderId: string
  paidAt: string          // ISO — payload serializável, sem Date/classe
}

export class InvoicePaidEvent extends DomainEvent<InvoicePaidPayload> {
  static readonly EVENT_NAME = "invoice.paid"   // fato passado
  static readonly EVENT_VERSION = 1

  readonly eventName = InvoicePaidEvent.EVENT_NAME
  readonly eventVersion = InvoicePaidEvent.EVENT_VERSION

  static from(args: { aggregateId: string; payload: InvoicePaidPayload }) {
    return new InvoicePaidEvent({ aggregateId: args.aggregateId, aggregateType: "invoice", payload: args.payload })
  }
}
```

Campos existentes imutáveis; só adicionar opcionais; bump `EVENT_VERSION` em mudança incompatível. `eventId` = ULID gerado no construtor.

### Quando usar cada um

| Cenário | Use |
| --- | --- |
| Resposta imediata / garantir conclusão antes de retornar | Facade |
| Dado pertence a outro módulo (consulta pontual) | Facade |
| ≥2 consumidores reagem ao mesmo fato | Evento |
| Consumidor opcional/lento/desacoplado | Evento |
| Cross-cutting (notificação, auditoria, analytics) | Evento |
| Listagem/consulta com filtro cross-módulo | §Queries cross-module |

Evento tem custo (debug, ordenação, versionamento) — não crie "para o caso de alguém ouvir".

## Kernel / Produto — Isolamento de módulos de negócio

A arquitetura parte a codebase em duas regiões — **kernel** (`shared/kernel/` + `shared/infra/`) e **produto** (`modules/`) — com regras de importação rígidas:

- **RULE A** — `shared/**` nunca importa `modules/**` (imports de tipo inclusos). O kernel não conhece o negócio.
- **RULE C** — o vocabulário de uma entrada do catálogo não sobrevive na casca do template
  (`shared/**`, `app.module.ts`, `db/schema.ts`, `apps/web/src/app/**`, `apps/web/src/shared/**`):
  nem em código, nem em comentário, nem em string. Lista fechada de 16 tokens proibidos:
  `identity`, `IdentityModule`, `accessProfile`, `access_profile`, `AccessProfile`,
  `PermissionsGuard`, `permissionCatalog`, `uploadProfile`, `UploadProfile`, `auditTrail`,
  `audit_trail`, `AuditRegistry`, `NotificationModule`, `notification_`, `TagModule`,
  `tag.` (prefixo de schema).

Ambas são automaticamente **verificadas por `apps/api/src/modules/module-boundaries.spec.ts`**; uma violação quebra a build.

Conteúdo de produto que o kernel precisa conhecer (tipo de notificação, permissão de categoria, configuração de schema) **não chega via import**. Há dois padrões:

1. **Slot na raiz (composition root)**: o `AppModule` passa ao `DatabaseModule.forRoot({ schema })` ou registra factory de fonte no `NotificationTemplateSourcesRegistry`. A forma de registro depende do caso — sempre no bootstrap, nunca no módulo de negócio.
2. **Declaração de tipo vazia (module augmentation)**: `PermissionKeyRegistry {}` e `NotificationTypeRegistry {}` vivem no kernel como interfaces vazias; cada módulo produto estende a seu registro (ex.: `identity` adiciona `"admin.users.read"` a `PermissionKeyRegistry`). Sem import, apenas declaração de tipo.

Vide ADR 0023 para headers de transporte (outra ponte cuidadosa entre camadas).

## Outbox — topologia e garantias

**Tudo em `_kernel`, tabelas únicas do kernel** (AD-012): `_kernel.outbox`, `_kernel.outbox_dead`, `_kernel.processed_events`. Não existe tabela de outbox por módulo.

```
@Transactional use case
  ├─> repo.save(agregado)        ┐ mesma tx
  └─> outbox.publish(event)      ┘ (publish sem tx aberta → throw)
        ↓ commit  →  trigger AFTER INSERT: pg_notify('outbox_new')

OutboxDispatcher (LISTEN outbox_new + poll fallback 2s; re-LISTEN em queda)
  FASE 1 (tx curta): SELECT … WHERE published_at IS NULL AND next_attempt_at <= now()
         ORDER BY aggregate_id, occurred_at FOR UPDATE SKIP LOCKED LIMIT 20
         + UPDATE next_attempt_at = now() + lease(60s); COMMIT em ms
  FASE 2 (fora de tx, por linha): ctx.run(buildEventContextStore(envelope), …)
         await emitter.emitAsync(eventName, envelope)   [span novo com LINK ao parent]
         sucesso → UPDATE published_at = now()
```

Garantias e regras:

- **At-least-once.** Falha (ou rejeição do handler): `attempts++`, backoff `min(2^n s, 1h) + jitter(0..30s)`. Após 8 tentativas → `outbox_dead` (`ON CONFLICT DO NOTHING` + delete) + log error.
- **Sem listener registrado ≠ sucesso**: não marca published; reentra a cada poll.
- **Sem ordering global** — FIFO best-effort por `aggregateId` intra-batch (ADR 0013).
- **Lease de 60s**: linha claimada e não publicada é re-claimada; o dedupe do consumer segura o efeito duplicado. Handler deve terminar bem abaixo de 60s.
- **Relógio do Postgres** (`now()` no SQL) — nunca `Date` do JS em comparação de lease/next_attempt (skew esconde linha elegível).
- **Retenção**: `@MaintenanceJob` purga published > 30 dias (3h da manhã). Replay manual: `outbox:replay --event-id=… | --since=ISO` (`src/db/outbox-replay.ts`).
- **Drain no shutdown**: nada novo inicia; o em voo é aguardado.
- O handler recebe o **`EventEnvelope` cru** (não a instância da classe); `correlationId`/`causationId`/`tenantId`/`traceparent` entram no envelope no `publish`, lidos do `RequestContext` — nunca do caller.

### Handler de evento — dois padrões de dedupe

**Efeito transacional (Regra 15):** `markIfNew` na primeira linha, dentro de `@Transactional` — mark + efeito + commit atômicos; crash entre efeito e commit → rollback → reprocessa.

```typescript
const CONSUMER = "shipping:invoice-paid"   // estável: renomear re-executa eventos passados

@OnEvent(InvoicePaidEvent.EVENT_NAME)
@Transactional()
@Traced({ name: "InvoicePaidHandler" })
async handle(envelope: EventEnvelope<InvoicePaidPayload>): Promise<void> {
  if (!(await this.processed.markIfNew(envelope.eventId, CONSUMER))) return
  await this.releaseShipment.execute({ orderId: envelope.payload.orderId })
}
```

**Efeito de IO externo (ADR 0022):** IO nunca dentro de tx (Regra 17) — o padrão inverte: `wasProcessed` (guard) → IO → `markIfNew`, **sem** `@Transactional`. Exceção propaga para o retry/dead-letter do dispatcher; duplicata na janela entre IO ok e mark (crash) é aceita — at-least-once. Exemplar: handler da triagem de feedback. Fluxo com estado por envio (e-mail) usa fila própria do consumer (delivery do notification, ADR 0025).

## Idempotência HTTP — `@Idempotent`

Store: `_kernel.idempotency_keys` — PK `(scope, key)`, `scope = "<tenantId|_>:<userId|_>"`, colunas `endpoint`, `request_hash` (sha256 canônico de `{method, path, body}` com chaves ordenadas), `status` (`in_progress | completed | failed`), `response_status`, `response_body`, `expires_at`.

Fluxo do interceptor:

1. **Header `Idempotency-Key` é opcional** (modelo Stripe — decisão registrada no código; não voltar a exigir 400). Sem chave → segue sem dedupe.
2. `tryReserve`: upsert `ON CONFLICT DO UPDATE … WHERE expires_at < now()` — insere `in_progress` ou reclama row expirada. Reservou → executa o handler.
3. Conflito com row viva:
   - `request_hash` diferente → **422** ("key reusada com payload diferente").
   - `in_progress` → **409** (aguarde e re-tente).
   - `completed` → replay: 2xx devolve o snapshot; 4xx/5xx persistido é **re-lançado como HttpException** para o filter reproduzir o RFC 7807 idêntico.
   - `failed` → `reopen` (CAS `failed → in_progress`): só o vencedor re-executa; perdedor recebe 409.
4. Resultado: sucesso e 4xx → `completed` com corpo (resposta determinística); 5xx → `failed` **sem** corpo (retentável).
5. **O snapshot roda após o COMMIT do use case** — não é atômico com ele; a janela `in_progress` órfã é reclamada por `expires_at`, não por lease (ADR 0009). **O `response_body` não é redigido, de propósito** (replay tem de ser idêntico; a mesma PII já mora no domínio; TTL curto) — decisão no código do interceptor.

TTL default 24h; cleanup nightly. **Onde aplicar:** rota mutável com efeito externo ou criação de agregado (pagamento, disparo, POST de criação). Não aplicar em GET nem PUT de overwrite puro. `Idempotency-Key` é a única exceção de header como input do caller (ADR 0023).

## Transações

`TransactionManager` guarda o executor (raiz ou tx) em ALS; `@Transactional` abre/junta tx, `@ReadOnly` marca leitura. Repository chama `getExecutor()`.

| Caso | Isolamento |
| --- | --- |
| Default | `READ COMMITTED` |
| Leitura-escrita condicional sem lock pessimista | `REPEATABLE READ` |
| Conflito complexo (raro) | `SERIALIZABLE` |

- **IO externo nunca dentro de `@Transactional`** — `onCommit` (cache, métrica, webhook) ou evento via outbox. `onCommit` **nunca** publica evento de domínio.
- Aninhamento: default é *join*; `propagation: 'requires_new'` abre savepoint.
- **Auditoria/security log:** evento de **falha** (`login_failed`) grava fora de tx via `outsideTransaction()`; evento de **sucesso** usa `recordInTx`, atado à tx (e lança fora dela). Teste de rollback prova os dois caminhos.
- **Dentro de tx, nunca uma segunda conexão do pool:** a raiz só sai por `outsideTransaction()`, que **lança se houver transação ativa**, em qualquer ambiente. Para escrever a partir de dentro de uma tx: `requires_new` (savepoint, mesma conexão) ou pós-commit (`onCommit`). ADR 0089.
- **Advisory lock na orquestração do scheduling** (5 use cases seguram o executor para o lock — ADRs 0045/0063): exceção consciente; o tipo do executor vaza, o desenho não.
- Trava: `src/openapi/transactional-coverage.spec.ts` — todo use case declara participação em tx (allowlist com motivo).

## Background jobs

Job de manutenção usa o runtime do kernel: `@MaintenanceJob("<name>")` decora a classe e
`registerMaintenanceJob(...)` **no topo do arquivo do próprio job** registra nome, cron e
**`lockId` único** no registry de processo (não existe mais um arquivo central de
schedule; nome duplicado ou colisão de `lockId` lança no boot — unicidade testada,
compartilhamento só declarado no spec). O `MaintenanceRuntime` abre o `RequestContext` do
job e toma o lock de **sessão** num `pg.Client` dedicado (fora do pool de aplicação, via
`DedicatedClientFactory`). O envelope **não** abre transação por padrão — o corpo roda em
autocommit; só `atomic: true` na própria chamada de `registerMaintenanceJob` abre uma
transação do pool, **depois** do lock (nenhum job declara `atomic: true` hoje). ADR 0089.

Fila persistente de negócio: a **geração de agendas em lote** tem dispatcher próprio com três tabelas no scheduling (ADR 0066) — slot ativo único por constraint, lease fenced (`WHERE lease_token = ?`), relógio do Postgres, contador por `COUNT`. **É exceção local**: um segundo caso assíncrono reabre a discussão de fila de verdade (BullMQ/pg-boss), não copia este dispatcher. O delivery do notification (ADR 0025) é o molde de fila de IO externo com estado por envio.

## Queries cross-module

Nada de JOIN entre schemas de módulos. Saídas, em ordem de preferência:

| Caso | Padrão |
| --- | --- |
| Validar/ler fato pontual de outro módulo | Facade do dono (ADR 0034) |
| Detalhe de 1 entidade combinada (raro) | BFF: facade × N com `Promise.all` (ADR 0068) |
| Relatório agregado, tolera staleness | Materialized view com ADR + owner |
| Query ad-hoc admin / contagem de uso | View documentada em ADR (ex.: `tag.tag_usage`, ADR 0057) |
| Listagem com filtro/ordenação cross-módulo | Composição de facades no módulo agregador (ex.: `usage`, ADR 0080); volume que não couber → read model **com ADR própria** |

**Não existe módulo de read model hoje** — `modules/report` é a central de relatórios (fila de PDF, ADR 0067), não projeção. Se um read model nascer, ele exige ADR com owner declarado, schema próprio, handlers de projeção e job de rebuild; até lá, nenhuma referência a `modules/reporting` é válida. BFF nunca em listagem paginada (N+1 garantido).

## Persistência (Drizzle)

- **Schema Postgres por módulo** (`pgSchema('<module>')` em `infrastructure/tables/<module>.schema.ts`). Reservados: `_kernel` (outbox, processed_events, idempotency_keys), `_sync` (sync do legado), `audit` (trilha).
- **Agregador manual**: `drizzle.config.ts` aponta para `shared/infra/database/schema.ts`, que re-exporta todos os `*.table.ts` — **tabela nova exige o `export *` lá**, senão drizzle-kit e `db.query` não a enxergam. Trava: `schema-completeness.spec.ts` (allowlist: `audit-entry`, mantida por migration manual). O tipo do executor enxerga o schema agregado inteiro — a fronteira é garantida pela trava de import e pela Regra 5, não pelo tipo (exceção consciente, AD-012).
- **Migrations à mão** (o `db:generate` exige TTY): escrever `NNNN_<module>_<slug>.sql` + entrada no `meta/_journal.json` com `when` **monotônico** (> máximo da base; passo sugerido 10.000.000). O gate `db:check:journal` (pré-push) valida pareamento journal↔sql, `when` crescente e migration nova contra `origin/main` ("nascer no passado = ignorada para sempre"). `idx` duplicado histórico é grandfathered; a ordem efetiva é a posição no array. **Nunca** renomear/reescrever migration já aplicada.
- Prefixo `NNNN_<module>_` vale **para migration nova** (histórico fica como está). Uma migration toca um schema só, salvo mudança com dois donos (trigger de auditoria, transferência) — aí o nome carrega os dois.
- CI roda migrations contra banco efêmero.

## Validação + OpenAPI (nestjs-zod)

```typescript
export const PayInvoiceBodySchema = z.object({ amount: z.number().positive() })
export const PayInvoiceResponseSchema = z.object({ /* … */ })

export class PayInvoiceBodyDto extends createZodDto(PayInvoiceBodySchema) {}
export class PayInvoiceResponseDto extends createZodDto(PayInvoiceResponseSchema) {}

export type PayInvoiceInput = {
  params: z.infer<typeof PayInvoiceParamsSchema>
  body: z.infer<typeof PayInvoiceBodySchema>
}
export type PayInvoiceOutput = z.infer<typeof PayInvoiceResponseSchema>
```

O documento OpenAPI sai de `SwaggerModule.createDocument` + `cleanupOpenApiDoc` (nestjs-zod v5) em `src/openapi/openapi-config.ts`. Headers de transporte (`Origin`, `X-CSRF-Token`, `X-Correlation-Id`) **nunca** viram parâmetro de operação — interceptor do api-client (ADR 0023); documenta-se em prosa na descrição.

## Erros (RFC 7807)

```json
{
  "type": "<PROBLEM_TYPE_BASE_URL>/billing/invoice-already-paid",
  "title": "Fatura já paga",
  "status": 409,
  "detail": "A fatura abc foi paga em 2026-05-10T14:23:00Z.",
  "instance": "/v1/invoices/abc/pay",
  "correlationId": "01HXYZ…"
}
```

- Classe custom estende `DomainError` (kernel): `status` e `type` abstratos, `title`/`detail` em pt-BR, opt-ins `retryAfterSeconds` (429) e `extensions` (membros RFC 7807 §3.2 — membros padrão vencem colisão).
- `type` = `<PROBLEM_TYPE_BASE_URL>/<módulo>/<slug-em-inglês>`. O `TYPE_BASE` do `domain/errors.ts` **é o nome da pasta do módulo** — trava `error-namespace.spec.ts`; exceções herdadas declaradas lá (`identity→auth`, `guest→hospitality` — renomear seria breaking do contrato de erro).
- **403 tem casa única**: `ForbiddenError` do kernel (`…/forbidden`). Módulo não declara a própria (trava).
- `ProblemDetailsFilter` global mapeia: `DomainError` → como declarado; validação Zod → `…/validation` 400 com `errors`; `HttpException` → `…/http/<status>`; resto → `…/internal` 500. `instance` sem query string (anti-PII); `Retry-After` em todo 429; content-type `application/problem+json`. Nunca vazar stack, SQL, path interno.
- O front compara `type` por `endsWith("/slug")` — o slug é contrato; não renomear sem tratar o consumidor.

## Logging

- `pino` JSON via `LoggerFactory.forModule(scope)` → `AppLogger`. **`console.*` é erro de lint em `src/`** — exceção só nos scripts CLI declarados no `eslint.config.mjs` (falam com o terminal por design).
- `AppLogger` injeta `requestId`, `correlationId`, `causationId`, `tenantId`, `userId`, `sessionId` em toda linha. `traceId`/`spanId` **não** entram à mão — o instrumentation-pino injeta `trace_id`/`span_id` nativos no instante da emissão.
- Erro **sempre** `{ err }` (objeto; pino preserva stack) — nunca `err.message`.
- Request log = 1 linha/request (interceptor global). SQL: dev = todas; prod = só `slow_query` (> 100 ms).
- Redaction: `authorization`, `cookie`, `*.password`, `*.token`, `*.creditCard`, `*.email`, `*.cpf`, `*.phone`.
- Backfills e jobs logam pelo `AppLogger` do contexto (`ctx.log` no `LegacyBackfillContext`) — o cron do sync roda dentro do processo da API; log fora do pino ali é invisível.
- Mensagem de log em pt-BR com termo técnico em inglês; evento nomeado `dominio.assunto_acao` (`sync.service.aborted_midrun`).

## Tracing

- OTel SDK + auto-instrumentations (`http`, `nestjs-core`, `pg`, `express`); iniciado por `tracing.bootstrap.ts` **antes** do `NestFactory` (primeira linha do `main.ts`). Dev: console exporter; prod: OTLP.
- `@Traced` em use case e handler. In-process: span filho (use case A → facade B → use case B). Cross-process (evento): trace **novo com link** ao parent via `traceparent` do envelope — async puro não é child.
- Sem span por método de repositório (o `pg` cobre). Atributos: primitivos pequenos, nunca payload.

## Boot (o que o main.ts realmente faz)

1. `import "./tracing.bootstrap"` (linha 1: dotenv dev → env → OTel).
2. `NestFactory.create` → `enableShutdownHooks` → `enableVersioning(URI, defaultVersion "1")`.
3. `applySecurity`: cookie-parser, helmet, CORS (origins em array), trust proxy.
4. `requestTimeout` 30min → middleware `RequestContext` → OpenAPI + `setupDocsAuth` → `listen`.

Pipes/interceptors/filter globais entram por **DI no AppModule** (não no main.ts): `APP_PIPE: ZodValidationPipe`, `APP_INTERCEPTOR: LogInterceptor` e `IdempotencyInterceptor`, `APP_FILTER: ProblemDetailsFilter`. Guards globais no IdentityModule + CoexistenceModule (§Autorização). Config: cada módulo tem `<module>.config.ts` (Zod) validado no boot — fail-fast.

## Travas de conformidade

Specs unit que rodam no pré-push e no CI; todas seguem o mesmo molde — varredura de filesystem, it de sanidade do glob, offenders `toEqual([])` e **allowlist com motivo por entrada + it de allowlist morta**:

| Trava | Onde | Garante |
| --- | --- | --- |
| `authz-coverage` | `src/openapi/` | toda rota declara exatamente um modo de acesso |
| `operation-id` | `src/openapi/` | operationId presente/único/camelCase (ADR 0027) |
| `transactional-coverage` | `src/openapi/` | todo use case declara participação em tx — `.run(` genérico (`ctx.run`, `als.run`) não conta, só `@Transactional`/`@ReadOnly`/`txm.run` |
| `coexistence-coverage` | `src/openapi/` | mutação em domínio gated tem o guard do legado |
| `module-boundaries` | `src/modules/` | imports respeitam camadas e fronteiras (§Camadas); nenhum módulo importa o token `DRIZZLE`/`PG_POOL` da conexão raiz (ADR 0089) |
| `schema-completeness` | `shared/infra/database/` | todo `*.table.ts` está no agregador do drizzle |
| `error-namespace` | `shared/kernel/errors/` | `TYPE_BASE` = nome do módulo; 403 só no kernel |
| lockId único | `shared/kernel/scheduling/` (spec do schedule) | colisão de advisory lock não silencia job |

`src/openapi/` guarda as quatro primeiras por precedente histórico (elas precisam do `include` do projeto `api` do vitest); trava nova nasce **junto do código que guarda**. Furar uma trava sem entrada de allowlist justificada = PR reprovado.

## Decisões rápidas

| Pergunta | Resposta |
| --- | --- |
| Facade ou evento? | Default facade; evento com ≥2 consumidores ou desacoplamento legítimo |
| Query cross-module? | §Queries cross-module (facade → BFF → MV/view+ADR → agregador) |
| Ciclo entre módulos? | Extrai leaf module OHS; `forwardRef` é sinal de desenho errado |
| Regra pura sem I/O? | `domain/` (entidade, engine, arquivo de domínio) — nunca solta em `application/` |
| Helper de ≥2 use cases? | `application/services/` (ADR 0026) |
| Isolamento de tx? | READ COMMITTED; REPEATABLE READ p/ leitura-escrita condicional; SERIALIZABLE raro |

## Regras de Ouro

1. Controller só recebe input, chama use case, retorna DTO.
2. Use case nunca retorna entidade — sempre DTO via view/mapper. Vale para facade.
3. Repository nunca devolve row crua — sempre entidade via persistence mapper.
4. `domain/` não importa NestJS, Drizzle, Zod, RequestContext, logger — só o próprio domain e `shared/kernel`.
5. Módulos se comunicam só via facade ou evento — nunca via repo/use case/port/**tabela** alheio. Ler schema de outro módulo direto (mesmo sem JOIN, mesmo read-only) é proibido: o cross-module read passa pela facade do dono. Ver ADR 0034. Exceção escrita: código fora de `src/modules/` (§Mapa de src/).
6. Toda rota: `@ApiTags`, `operationId` único; `/v1` vem do boot.
7. Zod = fonte da verdade do contrato HTTP.
8. Frontend nunca escreve cliente HTTP — `@platform/api-client`.
9. View/mapper transforma, não decide regra.
10. **Default = facade.** Evento só com ≥2 consumidores ou desacoplamento legítimo.
11. Eventos = fatos passados (`invoice.paid`).
12. Contratos de evento: imutáveis em campos existentes; só adicionar opcionais; bump `EVENT_VERSION` em mudança incompatível.
13. Evento sai via `OutboxPublisher.publish` dentro de `@Transactional`. `EventEmitter.emit` direto é **proibido** — o único emissor é o dispatcher do kernel.
14. Payload de evento serializável (sem `Date`, sem classes).
15. Handler de efeito transacional começa com `markIfNew` dentro de `@Transactional`. Handler de IO externo segue ADR 0022: `wasProcessed` → IO → `markIfNew`, sem tx.
16. Rota mutável com efeito externo ou criação de agregado = `@Idempotent`.
17. `@Transactional` em multi-repo. IO externo **nunca** dentro da tx — `onCommit` ou evento.
18. Repository sem `tx` na assinatura. Lê do `TransactionManager`.
19. Logger via `LoggerFactory.forModule`. `console.*` proibido (lint error; exceção só CLI declarada).
20. `RequestContext` por ALS. Nunca na assinatura.
21. `application/` depende de port. `infrastructure/` implementa.
22. Cross-módulo: facade (fato pontual), BFF (detalhe), MV/view + ADR (agregado), agregador de facades (listagem).
23. Decisão estrutural / exceção: ADR em `docs/adr/`.
24. `RequestContext` provê `userId`/`correlationId`/`tenantId`. Nunca na assinatura.
25. Throw é único caminho de erro. Sem `Result<T>`/`Either`.
26. `eventId` = ULID. `traceparent` no envelope do outbox.
27. Schema por módulo (`pgSchema('<module>')`). Sem join cross-schema sem ADR.
28. `@Idempotent` com store `(scope, key) PK + request_hash + snapshot + status + expires_at` em `_kernel`.
29. Entidade imutável: transição retorna nova instância (`new User({ ...this.props, campo })`); campos de `Props` são `readonly` + `Object.freeze(props)` no constructor. Ver ADR 0011 (freeze raso intencional).
30. Facade reexporta todo tipo que devolve; consumidor não faz deep import alheio nem para tipo.
31. Tabela nova entra no agregador `shared/infra/database/schema.ts` no mesmo commit.
32. Dentro de transação nunca se adquire outra conexão do pool: raiz só por `outsideTransaction()` fora de tx; `requires_new` ou pós-commit dentro. ADR 0089.

## Anti-padrões

- `EventEmitter.emit` direto no use case.
- `db.transaction(...)` à mão no use case.
- Repository com `tx` na assinatura.
- IO externo (HTTP, e-mail, storage) dentro de `@Transactional`.
- Handler transacional sem `markIfNew`; handler de IO externo com `@Transactional`.
- `console.log` (e `console.warn/error/info` fora de CLI declarada).
- `request.body` cru no log; `err.message` como string (perde stack — passar `{ err }`).
- `RequestContext`/`correlationId`/`userId` na assinatura.
- Use case importando classe de `infrastructure/`.
- Facade chamada por item dentro de laço (leitura N+1 ou write unitário em série — peça variante em lote).
- Facade devolvendo entidade de domínio.
- Deep import em `domain/`, `application/` ou `api/contracts` de outro módulo.
- View cross-schema sem ADR e sem owner.
- Remover/renomear campo de evento existente; `Date`/instância de classe no payload.
- `forwardRef` entre módulos (extraia leaf module).
- Barrel em `domain/`, `infrastructure/`; re-export de conveniência.
- Migration renumerada/reescrita depois de aplicada.
- `Result<T>`/`Either` para fluxo de erro.

## Onde criar X

```
Nova rota HTTP?                      → api/controllers/<action>.controller.ts
Outro módulo chama (síncrono)?       → api/facades/<operation>.facade.ts
Operação de negócio?                 → application/use-cases/<action>/ (módulo em layout <agregado>/ segue o local)
IO consumida pelo use case?          → domain/ports/<resource>.repository.ts (ou <x>.port.ts se não-repositório)
Reagir a evento externo?             → application/event-handlers/external/<event>.handler.ts
Reagir a evento próprio (saga)?      → application/event-handlers/internal/<event>.handler.ts
Mapeamento de resposta?              → application/views.ts (mapper @Injectable só com DI)
Serviço reutilizável de application? → application/services/ (ADR 0026)
Job de manutenção do módulo?         → application/jobs/<name>.job.ts + registerMaintenanceJob(...) no topo do arquivo (lockId único)
Validar input/output HTTP?           → api/contracts/<resource>.contract.ts
Regra de negócio pura?               → domain/ (entidade, engine/, arquivo de domínio)
Value object?                        → domain/value-objects/<vo>.ts
Acesso ao banco?                     → infrastructure/repositories/drizzle-<resource>.repository.ts
Tabela Drizzle?                      → infrastructure/tables/<resource>.table.ts + export no agregador
Schema Postgres do módulo?           → infrastructure/tables/<module>.schema.ts (pgSchema)
Contrato de evento (1 consumidor)?   → modules/<module>/infrastructure/events/<event>.event.ts
Contrato de evento (>1 módulo)?      → shared/kernel/events/<event>.event.ts (ADR 0025)
Env var do módulo?                   → modules/<module>/<module>.config.ts (Zod)
Env var global / adapter transversal?→ shared/config/env.ts / shared/infra/<concern>/
Script de operação (CLI)?            → src/db/ (banco), src/seeds/ (seed), src/legacy-import/ (legado)
Decisão estrutural / exceção?        → docs/adr/NNNN-titulo.md
```

## Checklist de nova feature

```
□ Schema Zod em api/contracts/
□ Port em domain/ports/ + token registrado no módulo
□ Repository implementa port; usa TransactionManager; persistence mapper
□ Use case em application/use-cases/<action>/ (ou no layout local do módulo)
  □ @UseCase + @Transactional/@ReadOnly + @Traced
  □ Logger via LoggerFactory.forModule
  □ Tipos via z.infer (input composto se params + query + body)
□ Mapeamento em views.ts
□ Controller em api/controllers/
  □ @ApiTags, operationId único (o /v1 vem do boot)
  □ Exatamente um de @Public | @SelfService | @OptionalAuth | @RequirePermission
  □ @Idempotent se mutável com efeito externo/criação
□ Evento (se houver): contrato no endereço certo (1 consumidor = módulo; >1 = kernel)
  □ Publicado via OutboxPublisher dentro da tx
  □ Handler com dedupe no padrão certo (markIfNew transacional | wasProcessed p/ IO)
□ Tabela nova: export no agregador schema.ts (trava schema-completeness)
□ Migration à mão NNNN_<module>_<slug>.sql + journal com when monotônico
□ Facade: exporta no módulo, reexporta os tipos que devolve, variante em lote se consumida em coleção
□ Erro novo estende DomainError com TYPE_BASE do módulo
□ Testes: unit (domain), integration (use case + Postgres real), e2e (fluxo do módulo)
□ pnpm contract; openapi.json commitado; turbo typecheck (web inclusive)
□ Front consome o gerado (@platform/api-client/<tag>)
□ Nova env var? <module>.config.ts (ou shared/config) validado no boot
```

## Pipeline de contrato

```
1. Schema Zod editado no backend
2. Controller anota @ApiTags + @ApiOperation({ operationId })
3. pnpm contract
   ├── api: exporta openapi.json
   ├── api-client: kubb regenera generated/
   └── web: lê src/ + generated/ em dev/typecheck/test via condição `development` do export; dist existe só para turbo build (prod); se opções rigorosas do compilador tripearem no código gerado, corrige-se no Kubb config ou tsconfig do api-client, nunca em `generated/`
4. turbo typecheck (web inclusive) + exercitar o fluxo mexido (Vite dev não typecheca)
5. CI: pnpm contract && git diff --exit-code openapi.json
```

Mudança de contrato quebra do lado do **front** (call sites do gerado) — o loop nunca termina na api. Quem consome a operação: `pnpm contract:consumers <operationId|rota>`. Diff legível: `pnpm contract:diff`. Ver ADR 0023 e o `AGENTS.md` (trava "a contract change is verified on the front").

### Package api-client (Kubb)

Gerado agrupado por tag OpenAPI; exports granulares (`./<tag>`, `./<tag>/zod`, `./<tag>/types`); `configureApiClient({ baseURL, onUnauthorized })` e headers cross-cutting por interceptor no transporte (`packages/api-client/src/client.ts` — CSRF, correlação; ADR 0015/0023). Front importa direto do gerado, nunca re-exporta (sem barrel).

## Testes

| Tipo | Escopo | Banco |
| --- | --- | --- |
| Unit (`*.spec.ts`) | `domain/` + application com dublês + travas de conformidade | nenhum |
| Integration (`*.int-spec.ts`) | `application/` + `infrastructure/` | Postgres real (testcontainers) |
| E2E (`*.e2e-spec.ts`) | controller → use case → outbox → handler | Postgres real |
| OpenAPI | snapshot do `openapi.json` | — |

Mock de banco proibido em integration/e2e. Facade pública entre módulos ganha spec de snapshot do shape. Detalhe operacional (runners, testcontainers, tiers no CI): [`docs/test/testing.md`](../test/testing.md). Unit + typecheck rodam no pré-push; **int/e2e só no CI** — mudança de guard/permissão/SQL exige rodá-los localmente antes de assumir verde.

## Stack (majors fixados)

**Backend** — `@nestjs/* ^10`, `@nestjs/event-emitter ^2`, `@nestjs/schedule ^4`, `drizzle-orm ^0.30`, `drizzle-kit ^0.20`, `pg ^8`, `zod ^3`, `nestjs-zod ^5`, `pino ^9`, `@opentelemetry/sdk-node ^0.50`, `ulid ^2`.

**api-client (dev)** — `@kubb/cli ^3`, `@kubb/plugin-{oas,ts,zod,client,react-query} ^3`.

Majors fixos; minor/patch via Renovate.
