# Changelog — `attachment`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [2.0.0]

### Breaking

- Specs migradas de Jest para Vitest via `node scripts/platform/jest-to-vitest.mjs
  catalog/attachment` (ADV-20260821-01): `jest.*` → `vi.*`, `jest.requireActual` →
  `await vi.importActual`, tipos `jest.Mock*`/`jest.SpyInstance` → `Mock`/`Mocked`/
  `MockedFunction`/`MockInstance` de `"vitest"`. `dependsOn` identity sobe para
  `>=2.0.0 <3.0.0`. Filhos em `>=1.0.0 <2.0.0` precisam rodar o codemod antes de atualizar.

### Fixed

- `module.json` `schemaExports` não listava `tables/attachment.schema` (a declaração
  `pgSchema("attachment")`): o snapshot do drizzle-kit gerava `"schemas": {}` e a migração
  baseline não emitia `CREATE SCHEMA "attachment"`, quebrando `pnpm catalog:check` em bancos novos.
- `drizzle-attachment.repository.int-spec.ts` referenciava
  `drizzle/migrations/0005_attachment_generic_upload_profiles.sql` — arquivo removido do kernel
  em `e30648f` (módulos migraram para o catálogo) e nunca recriado dentro da entrada.
  `module.json.customMigrations` ganha `01_generic_upload_profiles.sql`; o teste passa a achar o
  arquivo pelo sufixo do nome (a numeração de customMigrations é sequencial pela ordem de install
  do child, não fixa).
- Cross e2e teste "avatar de OUTRO user é rejeitado" migrado de `identity/single-tenant` para cá
  (`api/__e2e__/access-link-avatar-ownership.e2e-spec.ts`): exercitava
  `POST /v1/auth/access-link/avatar`, que só resolve `PROFILE_IMAGE_STORE` com `attachment`
  instalado — nunca o caso de um `catalog:check identity` standalone.

## [1.0.0]

### Adicionado

- Entrada inicial do catálogo, extraída de `apps/api/src/modules/attachment/**`: upload,
  download e log de acesso de anexos, com os perfis genéricos `avatar`, `access-link-avatar`,
  `document`, `image` e `multi` (AD-010).
- `api/domain/upload/**` — perfis de upload de produto dobrados para dentro da entrada
  (antes no kernel, em `kernel/upload/**`, que permanece lá apenas para módulos que não os
  usam mais).
- Testes de paridade (`parity/*.parity.spec.ts` + `contract.snapshot.json`) cobrindo o contrato
  HTTP (`uploadAttachments`, `downloadAttachment`), as regras dos perfis de upload e o contrato
  de `AttachmentFacade.listAccessLog`.

### Alterado

- Passa a implementar (bind) a porta `PROFILE_IMAGE_STORE`/`ProfileImageStore` do kernel para o
  avatar de perfil do `identity`, invertendo a dependência direta que a entrada tinha em
  `AttachmentFacade` (AD-024, T17c).
