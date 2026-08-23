# Catálogo — `tag`

Central de tags administrativas: CRUD, lixeira (stash/restore), purge definitivo e contagem de
uso agregada dos consumidores registrados. Publicada em `apps/api/src/modules/tag/**` quando um
app filho roda `pnpm platform module add tag`.

## Contrato

| Método | Path | operationId | Eventos | Use case / facade |
| --- | --- | --- | --- | --- |
| POST | `/v1/admin/tags` | `createTag` | — | `CreateTagUseCase` |
| GET | `/v1/admin/tags` | `listTags` | — | `ListTagsUseCase` |
| GET | `/v1/admin/tags/linkable` | `listLinkableTags` | — | `ListTagsUseCase` |
| GET | `/v1/admin/tags/{id}` | `getTag` | — | `GetTagUseCase` |
| PUT | `/v1/admin/tags/{id}` | `updateTag` | — | `UpdateTagUseCase` |
| DELETE | `/v1/admin/tags/{id}` | `deleteTag` | `tag-purged` (na purga efetiva) | `StashTagUseCase` |
| DELETE | `/v1/admin/tags/purge` | `purgeTags` | `tag-purged` | `PurgeTagsUseCase` |
| POST | `/v1/admin/tags/restore` | `restoreTags` | — | `RestoreTagsUseCase` |

Além das rotas HTTP, `TagDirectoryFacade` e `TagUsageRegistry` (exportadas por `TagModule`)
expõem, para consumo em processo por outras entradas do catálogo:
`TagDirectoryFacade.findLiveTagIds(ids)`, `describeTags(ids)` e
`TagUsageRegistry.register(reader)`/`totalsFor(tagIds)` — o slot de contagem de uso que um
módulo de produto preenche registrando o próprio `TagUsageReader`.

## Portas do kernel consumidas

- `shared/infra/database/drizzle.provider`
- `shared/kernel/database/pg-errors`
- `shared/kernel/domain/entity-props`
- `shared/kernel/errors/domain.error`
- `shared/kernel/events/domain-event.base`
- `shared/kernel/listing/apply-listing`, `shared/kernel/listing/listing-query.schema` e
  `shared/kernel/listing/paginated`
- `shared/kernel/transactional/transaction-manager`

## Dados

Schema Postgres dedicado `tag` (`infrastructure/tables/tag.schema.ts`), com uma tabela Drizzle
em `api/infrastructure/tables/tag.table.ts` (tabela `tags`). A tabela nasce do código TS.

`migrations/custom/01_audit_attach_tags.sql` encaixa `tags` na trilha de auditoria genérica
(`SELECT audit.attach('tag', 'tags', '{id}', '{}')`), extraído de
`apps/api/drizzle/migrations/0003_audit_trail.sql` — a entrada `audit` levou consigo o schema
`audit`, a tabela `audit.entries` e a função `audit.attach()`, mas deixou os `SELECT
audit.attach(...)` por tabela para a migration de cada módulo dono, conforme o comentário
original da migration da plataforma. `tag` depende de `audit.attach` existir para este passo
funcionar, mas **não** declara `dependsOn: audit`: é uma dependência de ordem de instalação
opcional, não uma dependência dura da entrada. O arquivo faz o `attach` dentro de um `DO $$`
que primeiro confere, via `pg_proc`/`pg_namespace`, se `audit.attach` existe — num app filho sem
a entrada `audit`, o passo é pulado e a migration instala normalmente. Se a entrada `audit` for
instalada depois de `tag`, este arquivo precisa ser reaplicado manualmente (não há
reencaixe retroativo automático).

## Decisões

Nenhuma decisão local além da extração 1:1 de `apps/api/src/modules/tag/**` — sem sucessor de
AD-003/004/007/008/009/010 nesta entrada.

**Casa dos e2e que precisam de usuário logado (AD-025).** `api/__e2e__/tags.e2e-spec.ts` é um
teste de integração entre entradas: semeia usuários com permissão e faz login por `/v1/auth/login`
antes de exercitar o CRUD de tags. Ele importa `seedUser` e `allowAllRateLimiter` da camada
`api/testing/` do `identity`, não de um harness compartilhado. A regra que vale aqui: **um e2e
cruzado mora na entrada que está a jusante no DAG de `dependsOn`** — quem depende hospeda o teste,
nunca a dependência. Por isso o spec fica no `tag` e a aresta `tag → identity` passa a ser
declarada (ver § Dependências); ela não fecha ciclo, já que `identity` não importa `tag`.

## Paridade

Os specs em `parity/*.parity.spec.ts` são copiados para `apps/api/src/modules/tag/__parity__/`
junto com `parity/contract.snapshot.json` e rodam via `pnpm vitest run --project api
apps/api/src/modules/tag` no app filho:

- `contract.parity.spec.ts` — compara `openapi.json` do filho contra `contract.snapshot.json`
  via `expectContractSubset`, garantindo que as oito operações de CRUD/lixeira continuam
  presentes com os mesmos campos obrigatórios (lê `openapi.json` a partir de `process.cwd()`).
  Não existe `openapi.json` estático versionado neste repositório — o snapshot foi extraído dos
  decorators `@ApiOperation`/`@Controller` dos controllers, por isso as respostas ficam
  deliberadamente rasas, no mesmo padrão do `downloadAttachment` da entrada `attachment`.
- `facade.parity.spec.ts` — fixa a superfície pública de `TagDirectoryFacade`
  (`findLiveTagIds`, `describeTags`) e `TagUsageRegistry` (`register`, `totalsFor`, vazio quando
  ninguém registrou), usada por futuros consumidores.

## Dependências

- `dependsOn`: `identity` (`>=1.0.0 <2.0.0`). **A aresta é só de teste**: nenhum arquivo de
  produção do `tag` importa `identity`, `attachment`, `audit` ou `notification` — quem importa é
  `api/__e2e__/tags.e2e-spec.ts`, que consome `identity/api/testing/{seed-user,
  allow-all-rate-limiter}` para montar a sessão autenticada que o CRUD exige. Sob AD-025 a aresta
  precisa ser declarada mesmo assim: uma entrada só importa outra por `dependsOn` declarado e
  acíclico. A única ligação com `audit` continua opcional e vive em
  `migrations/custom/01_audit_attach_tags.sql` (guardada, ver § Dados), não em código TS.
- `env`: nenhuma. O módulo não tem `tag.config.ts` nem lê `process.env`.

## Parte web

Esta entrada não distribui nenhuma parte web — não há `web/core` nem `web/react`.

## Follow-ups absorvidos

Nenhum. `module.json.absorbs` está vazio.
