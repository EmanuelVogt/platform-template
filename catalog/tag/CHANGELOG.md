# Changelog — `tag`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [3.0.0]

### Breaking

- Requer o kernel 3.x: a entrada deixa de suportar o kernel 2.x — o `kernelRange` abre
  para `>=3.0.0 <4.0.0` no corte da `v3.0.0`, e um child em kernel 2.x não instala mais
  esta versão.
- Exige `identity` 3.x: o `dependsOn` abre para `>=3.0.0 <4.0.0`. As cinco entradas se
  movem juntas na `v3.0.0`, então um child não instala mais esta versão ao lado de um
  `identity` 2.x.
- Nenhuma mudança de código nesta entrada: a versão se move só por esses motivos.

## [2.1.1]

### Changed

- `README.md`: § Paridade passa a dizer onde vivem os helpers de teste da entrada
  (`api/testing/` — `makeTag`, `seedTag`) e quem os importa hoje (ninguém; só o e2e desta
  entrada). Sem mudança de código; a versão sobe porque REL-04 exige que qualquer mudança no
  diretório da entrada desde a tag anterior mova a versão, inclusive uma mudança só de
  documentação.

## [2.1.0]

### Added

- Barril `testing/index.ts`: `makeTag` (entidade `Tag` pronta pra spec) e `seedTag`
  (cria uma tag via HTTP — a central não expõe atalho de banco). O e2e da entrada
  passa a importar do barril em vez de definir o próprio `createTag`/`login` locais
  (`login` vira `loginAs` do barril de identity).

### Changed

- `__e2e__/tags.e2e-spec.ts` migrado para o harness de e2e do kernel
  (`createE2eApp`/`withE2ePool`/`resetDb`) em vez do `test/setup/app-factory` local.

## [2.0.2]

### Changed

- Sem mudança de código. Corrige o `affects` de `ADV-20260822-05` para
  `>=1.0.0 <2.0.1` e registra por que `2.0.1` é o primeiro endereço inequívoco.
  A versão sobe porque REL-04 exige que qualquer mudança no diretório da entrada
  desde a tag anterior mova a versão — inclusive uma mudança apenas de changelog.

## [2.0.1]

### Changed

- Reformatação mecânica pelo `prettier` (config reparada em `prettier-format-gate`). Sem
  mudança de comportamento, versão de dependência ou conteúdo do manifesto.
- Esta versão também passa a ser o limite superior do `affects` de `ADV-20260822-05` (CAT-01):
  antes dela, `2.0.0` desta entrada endereçava duas árvores de código diferentes — uma
  sob a tag do template `v2.0.0`, outra sob `v2.1.0` (183 arquivos divergem entre elas em
  `catalog/`). `2.0.1` é a primeira versão com endereço inequívoco.

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
