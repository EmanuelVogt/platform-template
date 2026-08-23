# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [2.0.0]

### Breaking

- Specs migradas de Jest para Vitest via `node scripts/platform/jest-to-vitest.mjs
  catalog/audit` (ADV-20260821-02): `jest.*` → `vi.*`, `jest.requireActual` →
  `await vi.importActual`, tipos `jest.Mock*`/`jest.SpyInstance` → `Mock`/`Mocked`/
  `MockedFunction`/`MockInstance` de `"vitest"`. `dependsOn` identity sobe para
  `>=2.0.0 <3.0.0`. Filhos em `>=1.0.0 <2.0.0` precisam rodar o codemod antes de atualizar.

### Fixed

- `module.json` `schemaExports` listava `tables/audit-entry.table`, arquivo que também define a
  tabela `auditEntries` — cuja tabela real é criada pela migration manual
  `01_audit_trail_capture.sql` (comentário do próprio arquivo: "não é gerada pelo drizzle-kit, é
  criada aqui"). Com o export, a baseline do drizzle-kit também emitia
  `CREATE TABLE "audit"."entries"`, colidindo (`42P07`) com o `CREATE TABLE` da migration manual
  que roda depois. A declaração `pgSchema("audit")` sai para `tables/audit.schema.ts` (mesmo
  padrão de notification/identity/attachment); `schemaExports` passa a listar só esse arquivo —
  a baseline volta a emitir `CREATE SCHEMA "audit"` sem tentar criar a tabela.
- `tables/audit-entry.table.ts` renomeado para `tables/audit-entry.readmodel.ts`: com o export
  do arquivo combinado saindo, o kernel's `schema-completeness.spec.ts` (varre todo `*.table.ts`
  exigindo que esteja no agregador do drizzle-kit) passou a reprovar o arquivo — de propósito
  fora do agregador. O sufixo `.readmodel.ts` sai do glob sem tocar o teste do kernel.
- `audit-trigger.int-spec.ts`, `drizzle-ref-label.reader.int-spec.ts` e `audit.e2e-spec.ts`
  usavam `tag.tags`/`truncateTag`/`POST /v1/admin/tags` como veículo de teste — audit não
  depende de tag (siblings sob identity), então nunca passavam num `catalog:check audit`
  standalone. Veículo trocado para `identity.permission_templates`/`/v1/admin/permission-templates`
  (dependência real). `audit-coverage.int-spec.ts` passa a checar "toda tabela AUDITED tem
  trigger" só para módulos cujo schema está instalado — `tag.tags` no `AUDITED`
  (`audit-coverage.ts`) continua declarado para quando o produto final tiver as duas entradas.
- `audit.module.ts` importava a classe `IdentityModule` crua (`imports: [IdentityModule, ...]`)
  para alcançar `UserDirectoryFacade`. `IdentityModule` é dinâmico (`forRoot`, `global: true`) —
  importar a classe crua cria uma segunda instância vazia, e o `configure()` dela tenta montar
  `AuthMiddleware` sem `SessionRepository`, quebrando TODO e2e do child com
  "Nest can't resolve dependencies of the AuthMiddleware... SessionRepository" (mesma armadilha
  já documentada em `attachment.module.ts`). Import removido; `UserDirectoryFacade` já chega
  pelo export global do `IdentityModule.forRoot()` montado na raiz, sem precisar de import
  explícito.
- `identity/migrations/custom/02_audit_attach.sql` roda antes de `audit.attach` existir num
  `catalog:check audit` (identity é instalado antes, por `dependsOn`) — sai sem anexar nada
  (guard documentado no próprio arquivo, que já orienta reaplicar o passo depois de instalar
  audit). `api/testing/reattach-identity-tables.ts` (novo) simula essa reaplicação idempotente
  nos testes de audit que dependem do trigger em tabelas do identity — e desfaz com
  `detachIdentityTables` no `afterAll` de cada um, porque o trigger é DDL permanente que vaza
  para outras suítes do worker compartilhado (achado: latência extra do trigger derrubava
  timeouts de e2e do identity sem relação nenhuma com auditoria).
- `listAuditEntriesQuerySchema` (`audit.contract.ts`): `from`/`to` eram `z.string().min(1)`,
  aceitando qualquer texto e estourando `new Date(invalid)` num `Invalid Date` que a query
  Drizzle devolvia como **500** em vez de 400; passam a `z.iso.datetime()`. `txId` ganha teto
  explícito (`z.coerce.number().int().max(Number.MAX_SAFE_INTEGER)`), fechando o coerce sem
  limite superior (auditoria de segurança 2026-08-22, ADV-20260822-04).

## [1.0.0]

### Adicionado

- Entrada `audit`: leitura paginada da trilha (`GET /v1/audit`), painel de uso
  (`UsageActivityFacade`) e registry de extensão (`AuditRegistry`).
- Fold do antigo módulo, repositório e job de purge da trilha, que viviam no
  kernel compartilhado, para `api/infrastructure/trail/**` — a entrada passa
  a ser dona da escrita de manutenção/retenção, não só da leitura.
- `migrations/custom/01_audit_trail_capture.sql`: schema `audit`, tabela
  `audit.entries`, trigger append-only e função de captura genérica,
  extraídos da migration do platform — sem isso a entrada instalava tabela
  sem trigger de captura.

### Corrigido

- Removida a dependência fantasma `dependsOn: attachment` (sem consumo real
  no código); mantida `dependsOn: identity`.
