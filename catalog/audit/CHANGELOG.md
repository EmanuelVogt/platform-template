# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [3.1.0]

### Changed

- Open kernelRange for kernel 4.x (`>=4.0.0 <5.0.0`); no functional change.

## [3.0.0]

### Breaking

- Requer o kernel 3.x: a entrada deixa de suportar o kernel 2.x — o `kernelRange` abre
  para `>=3.0.0 <4.0.0` no corte da `v3.0.0`, e um child em kernel 2.x não instala mais
  esta versão.
- Exige `identity` 3.x: o `dependsOn` abre para `>=3.0.0 <4.0.0`. As cinco entradas se
  movem juntas na `v3.0.0`, então um child não instala mais esta versão ao lado de um
  `identity` 2.x.
- `CLINIC_TZ` some do leitor de estatísticas: os buckets por dia/semana leem
  `APP_TIMEZONE` (IANA, default `UTC`). Um child que dependia do fuso fixo muda de
  recorte; ver `ADV-20260824-04`.
- O base set da trilha troca o schema das sete tabelas da fatia profissional, de `identity`
  para `professional` (`user_professional_areas`, `user_professional_services`,
  `user_scheduling_areas`, `user_professional_schedule_configs`/`_slots`/`_blocks`,
  `professional_default_hours`), e passa a cobrir também a nova `professional_profile` — oito
  no total. A declaração continua em `BASE_AUDITED_TABLES`/`AUDITED`, dentro de `audit`: a
  entrada `professional` não tem `audit` em `dependsOn` para chamar `registerTables` ela mesma,
  e uma segunda chamada colidiria em `DuplicateAuditRegistrationError` de qualquer forma
  (`registerTables` indexa por nome de tabela puro). `professional` só anexa o trigger
  `audit_row` via SQL, no próprio `attach_audit()` — o mesmo precedente da entrada `tag`. Um
  child que instale a entrada nova sem aplicar esta versão fica com o trigger anexado e sem
  cobertura declarada: `audit-coverage.int-spec.ts` reprova. O alvo de FK
  `professional_user_id` permanece no base set. Ver `ADV-20260824-02`.

### Fixed

- `drizzle-activity-stats.reader.spec.ts`: o import de `TransactionManager` vinha depois do
  import irmão do leitor e o `captured.bucket as SQL` removia `undefined` por asserção de tipo.
  Sem a correção, `import-x/order` e `@typescript-eslint/non-nullable-type-assertion-style`
  reprovavam o `pnpm check` de todo filho que instala a entrada — `catalog/` está fora de toda
  invocação de ESLint do template, então o desvio só aparece no filho. Ver `ADV-20260825-01`.
- `drizzle-activity-stats.reader.int-spec.ts`: as asserções embutem `-03:00` no bucket esperado
  e asseveram o dia local de Brasília, mas esta mesma versão fez o default do kernel ser `UTC` e
  o spec nunca declarava `APP_TIMEZONE`. São 7 falhas no `pnpm test:db` de todo filho que instala
  a entrada; o spec agora declara o fuso que testa. Ver `ADV-20260825-04`.
- `api/testing/reattach-identity-tables.ts` (renomeado para `reattach-audit-hook-tables.ts`):
  `reattachIdentityTables` reanexava as oito tabelas de `professional` também — via
  `attach_module_hooks()`, que descobre qualquer schema instalado com `attach_audit()`, não só o
  do `identity` — mas `detachIdentityTables` só desanexava as sete do `identity`. Num `test:db`
  compartilhado os triggers de `professional` sobreviviam para as suítes seguintes.
  `detachAuditHookTables` deriva a lista de `professional` de `AUDITED` (a mesma fonte que
  `audit-coverage.int-spec.ts` cobra em paridade) e as dropa também, sob um guard de schema —
  `professional` não é `dependsOn` de `audit`, então pode não estar instalada no banco.

## [2.1.2]

### Fixed

- `list-audit-entries.use-case.spec.ts`: o teste "sem table não passa tables" afirmava só
  `toBeUndefined()` e passava sob uma implementação errada. Agora afirma o argumento inteiro
  recebido pelo repositório. Sem a correção, `platform/no-existence-only-assert` (a regra de
  lint nova do kernel) reprovava `pnpm check` em todo filho que instala a entrada.

## [2.1.1]

### Changed

- `README.md`: passa a dizer onde vivem os helpers de teste da entrada (`api/testing/` —
  `makeAuditEntry`, `seedAuditEntry`, `reattachIdentityTables`/`detachIdentityTables`,
  `reattachTagTables`/`detachTagTables`) e quem os importa hoje (ninguém; o e2e desta entrada
  consome `identity/api/testing/` para sessão). Sem mudança de código; a versão sobe porque
  REL-04 exige que qualquer mudança no diretório da entrada desde a tag anterior mova a versão,
  inclusive uma mudança só de documentação.

## [2.1.0]

### Added

- Barril `testing/index.ts`: `makeAuditEntry`/`seedAuditEntry` (linha de
  `audit.entries` pronta pra spec / semeada direto no banco — a trilha é
  append-only e normalmente gerada por trigger). `reattachIdentityTables`,
  `detachIdentityTables`, `reattachTagTables` e `detachTagTables` (já existiam
  soltos em `testing/`) passam a sair também do barril, sem segunda
  implementação.

### Changed

- Os dois e2e da entrada (`audit.e2e-spec.ts`, `audit-product-extension.e2e-spec.ts`)
  migrados para o harness de e2e do kernel
  (`createE2eApp`/`withE2ePool`/`resetDb`) em vez do `test/setup/app-factory` local.

## [2.0.2]

### Changed

- Sem mudança de código. Corrige o `affects` de `ADV-20260822-04` para
  `>=1.0.0 <2.0.1` e registra por que `2.0.1` é o primeiro endereço inequívoco.
  A versão sobe porque REL-04 exige que qualquer mudança no diretório da entrada
  desde a tag anterior mova a versão — inclusive uma mudança apenas de changelog.

## [2.0.1]

### Changed

- Reformatação mecânica pelo `prettier` (config reparada em `prettier-format-gate`). Sem
  mudança de comportamento, versão de dependência ou conteúdo do manifesto.
- Esta versão também passa a ser o limite superior do `affects` de `ADV-20260822-04` (CAT-01):
  antes dela, `2.0.0` desta entrada endereçava duas árvores de código diferentes — uma
  sob a tag do template `v2.0.0`, outra sob `v2.1.0` (183 arquivos divergem entre elas em
  `catalog/`). `2.0.1` é a primeira versão com endereço inequívoco.

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
- Nenhum módulo conseguia anexar as próprias tabelas à trilha num filho recém-gerado: quem tem
  tabela auditável é `dependsOn` desta entrada, logo instala **antes** dela, e a chamada de
  `audit.attach` na migração do módulo caía no guard "entrada audit ausente" — o filho nascia sem
  trilha nenhuma, inclusive sem as colunas de hash redigidas do identity (auditoria de segurança
  2026-08-22, ADV-20260822-04). Nova migração `02_attach_module_hooks.sql`: a função
  `audit.attach_module_hooks()` procura, em todo schema instalado, o hook `<schema>.attach_audit()`
  (sem argumentos, idempotente, com a lista das tabelas e colunas redigidas **do módulo**) e o
  executa no fim da instalação do audit. A entrada segue sem conhecer quem é auditado — conhece só
  o nome do hook. `api/testing/reattach-identity-tables.ts` deixa de copiar a lista do identity e
  passa a chamar `audit.attach_module_hooks()`, o mesmo passo que a migração executa; o
  `detachIdentityTables` do `afterAll` continua, porque o trigger é DDL permanente que vaza para
  outras suítes do worker compartilhado (achado: latência extra do trigger derrubava timeouts de
  e2e do identity sem relação nenhuma com auditoria).
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
