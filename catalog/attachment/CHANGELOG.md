# Changelog — `attachment`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [2.0.2]

### Changed

- Sem mudança de código. Corrige o `affects` de `ADV-20260822-02` para
  `>=1.0.0 <2.0.1` e registra por que `2.0.1` é o primeiro endereço inequívoco.
  A versão sobe porque REL-04 exige que qualquer mudança no diretório da entrada
  desde a tag anterior mova a versão — inclusive uma mudança apenas de changelog.

## [2.0.1]

### Changed

- Reformatação mecânica pelo `prettier` (config reparada em `prettier-format-gate`). Sem
  mudança de comportamento, versão de dependência ou conteúdo do manifesto.
- Esta versão também passa a ser o limite superior do `affects` de `ADV-20260822-02` (CAT-01):
  antes dela, `2.0.0` desta entrada endereçava duas árvores de código diferentes — uma
  sob a tag do template `v2.0.0`, outra sob `v2.1.0` (183 arquivos divergem entre elas em
  `catalog/`). `2.0.1` é a primeira versão com endereço inequívoco.

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
- `module.json` `dependsOn` não declarava `notification`: o e2e relocado sobrepõe a porta
  `MAILER` de `notification` para interceptar o e-mail de convite e extrair o token do
  access-link (o fluxo de convite de `identity` publica pela porta real), um acoplamento de
  produção genuíno que o guard `catalog-custom-migrations.test.mjs` cobra. `dependsOn` ganha
  `notification` em `>=2.0.0 <3.0.0`, mesma faixa declarada por `identity` — o grafo continua
  acíclico (`notification.dependsOn` é `[]`) (ADV-20260821-01).

### Security

- `GetAttachmentForDownloadUseCase.execute` (`DownloadResult`, superfície pública da facade) passa
  a devolver `profile: UploadProfileName | "legacy"` junto com o stream — mudança de forma
  aditiva usada para decidir a política de exibição por perfil, não só pelo `content_type`
  gravado.
- `DownloadAttachmentController` passa a decidir `inline` vs. `attachment` por uma allowlist
  fechada de `content_type` (`image/jpeg`, `image/png`, `image/webp`) checada pelos magic bytes
  do arquivo (`content-type-sniff.ts`), nunca pelo header enviado no upload — corrige a XSS
  refletida por upload de HTML/SVG disfarçado de imagem servido inline (UPLOAD-3/4).
- `UploadAttachmentsBatchUseCase` passa a rodar a mesma sniffagem de magic bytes que o upload
  simples já fazia — o lote era o caminho que ainda confiava no `Content-Type` declarado pelo
  cliente.
- Nova `ATTACHMENT_MAX_CONCURRENT_UPLOADS`: `multipart-files.ts` limita, por um
  `InFlightGate` do kernel, quantos uploads multipart esta entrada processa ao mesmo tempo na
  instância — parte da correção do vazamento de sockets do storage, cujo outro lado
  (`STORAGE_MAX_SOCKETS` + `keepAlive` no `httpsAgent` do adapter R2) é do kernel
  (`shared/infra/storage/storage.config.ts`, fora do Touches desta entrada).
- Nova `ATTACHMENT_PENDING_QUOTA_BYTES`: teto de bytes pendentes (upload iniciado, nunca
  confirmado) por dono, cota contra esgotar o storage com lixo nunca finalizado.

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
