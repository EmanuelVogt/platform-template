# Changelog — `tag`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [2.0.0]

### Breaking

- Specs migradas de Jest para Vitest via `node scripts/platform/jest-to-vitest.mjs
  catalog/tag` (ADV-20260821-05): `jest.*` → `vi.*`, `jest.requireActual` →
  `await vi.importActual`, tipos `jest.Mock*`/`jest.SpyInstance` → `Mock`/`Mocked`/
  `MockedFunction`/`MockInstance` de `"vitest"`. `dependsOn` identity sobe para
  `>=2.0.0 <3.0.0`. Filhos em `>=1.0.0 <2.0.0` precisam rodar o codemod antes de atualizar.

### Fixed

- `module.json` `schemaExports` não listava `tables/tag.schema` (a declaração
  `pgSchema("tag")`): o snapshot do drizzle-kit gerava `"schemas": {}` e a migração baseline
  não emitia `CREATE SCHEMA "tag"`, quebrando `pnpm catalog:check` em bancos novos.

### Security

- `ListTagsUseCase` passa a exigir a permissão `admin.tags.trash.read` quando `?deleted=true` —
  antes a lixeira era legível só com `admin.tags.read`, um upgrade de leitura grátis que a
  permissão `trash.read` do catálogo de acesso declarava mas nunca era checada (auditoria de
  segurança 2026-08-22, AUTHZ-2, ADV-20260822-05).

## [1.0.0]

### Adicionado

- Entrada inicial do catálogo, extraída de `apps/api/src/modules/tag/**`: CRUD de tags, lixeira
  (stash/restore), purge definitivo e contagem de uso agregada via `TagUsageRegistry`.
- `migrations/custom/01_audit_attach_tags.sql` — encaixe (guardado) da tabela `tags` na trilha
  de auditoria genérica, extraído de `apps/api/drizzle/migrations/0003_audit_trail.sql`.
- Testes de paridade (`parity/*.parity.spec.ts` + `contract.snapshot.json`) cobrindo o contrato
  HTTP e a superfície pública de `TagDirectoryFacade`/`TagUsageRegistry`.
