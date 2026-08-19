# Catálogo — `audit`

Trilha de auditoria: leitura paginada da captura genérica por trigger
(`audit.entries`) e a manutenção/retenção dessa trilha (purge LGPD).

## Contrato

| Método | Path        | operationId       | Eventos | Facades envolvidas                     |
| ------ | ----------- | ------------------ | ------- | ---------------------------------------- |
| GET    | `/v1/audit` | `listAuditEntries` | nenhum  | `AuditRegistry` (escopo por permissão)   |

Fora do HTTP, a entrada exporta duas facades para outros módulos:

- `UsageActivityFacade.countActivityByArea` — contagem de alterações por
  assunto do sistema, para paineis de uso.
- `AuditRegistry` — registro em runtime de tabelas auditadas e alvos de FK
  (ver `## Decisões`).

## Portas do kernel consumidas

- `shared/kernel/access/decorators` (`RequireAnyPermission`) e
  `shared/kernel/access/permission.types` (`PermissionKey`).
- `shared/kernel/context/request-context` (`RequestContext`, escopo de acesso
  do ator).
- `shared/kernel/errors/forbidden.error` e `shared/kernel/errors/domain.error`.
- `shared/kernel/listing/**` (`apply-listing`, `paginated`,
  `listing-query.schema`, `list-query.decorator`) — paginação padrão.
- `shared/kernel/tracing/traced.decorator`.
- `shared/kernel/transactional/transaction-manager` e
  `shared/kernel/transactional/transactional.decorator`.
- `shared/kernel/use-case/use-case.decorator` (e o tipo `UseCase`).
- `shared/kernel/clock/clock`, `shared/kernel/logging/logger.factory`,
  `shared/kernel/scheduling/maintenance-job.decorator` — usados pelo job de
  purge (`infrastructure/trail/purge-audit.job.ts`).
- `shared/infra/database/drizzle.provider` (`DrizzleExecutor`).

## Dados

- `api/infrastructure/tables/audit-entry.table.ts` — view Drizzle de leitura
  de `audit.entries` (schema `audit`). É deliberadamente excluída da geração
  do `drizzle-kit` (comentário no próprio arquivo): a tabela real e o trigger
  genérico de captura são criados por uma migration manual do platform
  (hoje `apps/api/drizzle/migrations/0003_audit_trail.sql`), não por este
  código TS.
- `migrations/custom/01_audit_trail_capture.sql` — extraído da migration do
  platform `apps/api/drizzle/migrations/0003_audit_trail.sql` (schema, tabela
  e índices não são gerados pelo drizzle-kit; ver acima). Cria: o schema
  `audit`; a tabela `audit.entries` com seus índices (tempo, entidade, ator,
  tx, brin de `occurred_at`); o trigger append-only (`restrict_mutation`) que
  bloqueia `UPDATE` e só libera `DELETE` com o GUC transaction-scoped
  `app.audit_maintenance=on`, mais o `REVOKE UPDATE, TRUNCATE` de defesa em
  profundidade; a função de captura genérica `audit.record_row_change`
  (redaction, `changed_keys`, contexto do ator via `app.audit_ctx`); o helper
  `audit.attach(schema, tabela, pk_cols, colunas_redigidas)`; a extensão
  `pg_trgm` e o índice GIN usado pela busca por `q`. **Não inclui** as
  chamadas `SELECT audit.attach(...)` para tabelas específicas (ex.:
  `identity.users`, `tag.tags`) — cada módulo dono de uma tabela auditável
  chama `audit.attach(...)` na própria migration ao criar a tabela; isso não
  é responsabilidade desta entrada (mesma decisão já expressa no comentário
  original da migration: "módulo de produto novo anexa as suas em migration
  própria"). Requisito de ambiente: o papel de banco usado pela migration
  precisa de permissão para `CREATE EXTENSION pg_trgm` (extensão padrão do
  Postgres; a maioria dos provedores gerenciados libera sem superuser).

## Decisões

- **Registry único em runtime (sucessor local de AD-009).** A extensão da
  auditoria é um único registry (`AuditRegistry`, exportado por
  `AuditModule`): alvos de FK (coluna → `{schema, table, labelColumn}`), dono
  de tabela (tabela → chave de permissão), satélites de agregado e tabelas
  técnicas. Os registros do base set (identity, tag) passam pelo mesmo
  registry, então todo consumidor tem um único caminho de consulta. Registro
  duplicado lança `DuplicateAuditRegistrationError`. As listas de cobertura
  (`AUDITED`/`EXEMPT`/`MODULE_SCHEMAS` em `domain/audit-coverage.ts`)
  continuam sendo só uma guarda de teste (plataforma), não uma fonte de
  runtime.
- **Acoplamento com `attachment` (facade) — sem gap encontrado hoje.** A
  tarefa original previa que a leitura de access-log de attachment
  alcançasse internals do módulo attachment e devesse ser roteada pela
  facade. Investigação no código atual não encontrou nenhum import real: a
  única referência a `attachment` em toda a árvore de `audit` é a string
  `"attachment.attachment_access_logs"` em `domain/audit-coverage.ts`
  (metadado de cobertura — marca a tabela como isenta do trigger, migration
  0003, linhas 169-172, não é uma consulta). A facade `AttachmentFacade`
  (`apps/api/src/modules/attachment/api/facades/attachment.facade.ts:97`) já
  expõe `listAccessLog(attachmentId: string): Promise<ListAttachmentAccessLogResult>`,
  então se um consumo futuro precisar do access log de um attachment, o
  caminho certo é esse método — nada a substituir hoje. Não há `dependsOn:
  attachment` no `module.json`: sem consumo real, declarar a dependência
  forçaria todo child que instala `audit` a instalar `attachment` também e
  quebraria o `resolveDeps` (aresta para uma entrada da qual `audit` não
  depende de fato). Se um consumo real for adicionado depois, a dependência
  entra junto.
- **Fold da trilha de escrita.** O módulo, repositório e job de purge que
  viviam no kernel compartilhado viraram `api/infrastructure/trail/**` desta
  entrada. Nenhum consumidor do kernel resta no template. `AuditTrailModule`
  continua
  `@Global()` (comportamento preservado) porque a escrita da trilha precisa
  ficar disponível para qualquer módulo que faça purge de titular (ex.:
  identity, guest) sem um import cruzado explícito com este módulo.
- **Extração do trigger SQL para a entrada.** A tabela `audit.entries` e o
  mecanismo de captura por trigger foram extraídos de
  `apps/api/drizzle/migrations/0003_audit_trail.sql` (migration do platform,
  fora do `Touches` original desta tarefa, mas necessário — sem isso a
  entrada instala tabelas sem trigger de captura e audit não grava nada) para
  `migrations/custom/01_audit_trail_capture.sql` (ver `## Dados`). As
  chamadas `SELECT audit.attach(...)` específicas de identity/tag não vieram
  junto — são wiring de cada módulo dono de tabela, não da entrada `audit`.

## Paridade

`parity/contract.parity.spec.ts` chama `expectContractSubset` contra o
`openapi.json` gerado do app e o snapshot `parity/contract.snapshot.json`,
confirmando que a operação `listAuditEntries` (GET `/v1/audit`) segue exposta
com o mesmo contrato. Rodar via `pnpm --filter api test` (specs do app) depois
que a entrada for adotada em `apps/api/src/modules/audit/__parity__/`.

Para confirmar que o trigger de captura (`migrations/custom/01_audit_trail_capture.sql`)
realmente dispara depois de aplicado, `api/infrastructure/trail/audit-trigger.int-spec.ts`
insere/atualiza/deleta em `tag.tags` e `identity.users` e lê `audit.entries`
diretamente. Esse teste assume que essas duas tabelas já têm o trigger
`audit_row` anexado via `SELECT audit.attach(...)` — chamada que pertence às
migrations dos módulos `identity`/`tag`, não a esta entrada (ver `##
Dados`). Um child que adota `audit` só vê esse int-spec passar depois que os
módulos donos dessas tabelas chamarem `audit.attach(...)`.

## Dependências

- `identity` (`^1.0.0`) — resolução de nome do ator
  (`UserDirectoryFacade`) e catálogo de permissões
  (`permission-catalog.facade`, chaves `AUDIT_PERMISSION_KEYS`/
  `FULL_AUDIT_PERMISSION`).
- `attachment` — **não é dependência declarada** (sem consumo real hoje; ver
  `## Decisões`).
- `env`: nenhuma variável de ambiente própria.

## Parte web

Esta entrada não tem parte web — não existe `web/core` nem `web/react`.

## Follow-ups absorvidos

Nenhum (`absorbs: []`).
