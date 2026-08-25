# Changelog — `notification`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [2.1.0]

### Added

- Barril `testing/index.ts`: `fakeMailer` (único dono — identity reexporta daqui em vez de
  manter uma segunda implementação), `findSent` (probe de delivery `sent` por tipo, pro `until`
  do `drainOutbox`), `makeNotification` (entidade `Notification` pronta pra spec) e
  `DELIVERY_DISPATCHERS(app)` (os dois despachantes — `OutboxDispatcher` do kernel +
  `DeliveryDispatcher` da entrada — que um e2e de notificação precisa girar). Os e2e da
  própria entrada e os cruzados em identity passam a importar daqui em vez de redefinir cada
  helper por arquivo.

### Changed

- `__e2e__/notifications-product-extension.e2e-spec.ts` migrado para o harness de e2e do kernel
  (`createE2eApp`/`withE2ePool`/`resetDb`/`drainOutbox`) em vez do `test/setup/app-factory`
  local.

## [2.0.2]

### Changed

- Sem mudança de código. Corrige o `affects` de `ADV-20260822-03` para
  `>=1.0.0 <2.0.1` e registra por que `2.0.1` é o primeiro endereço inequívoco.
  A versão sobe porque REL-04 exige que qualquer mudança no diretório da entrada
  desde a tag anterior mova a versão — inclusive uma mudança apenas de changelog.

## [2.0.1]

### Changed

- Reformatação mecânica pelo `prettier` (config reparada em `prettier-format-gate`). Sem
  mudança de comportamento, versão de dependência ou conteúdo do manifesto.
- Esta versão também passa a ser o limite superior do `affects` de `ADV-20260822-03` (CAT-01):
  antes dela, `2.0.0` desta entrada endereçava duas árvores de código diferentes — uma
  sob a tag do template `v2.0.0`, outra sob `v2.1.0` (183 arquivos divergem entre elas em
  `catalog/`). `2.0.1` é a primeira versão com endereço inequívoco.

## [2.0.0]

### Breaking

- Specs migradas de Jest para Vitest via `node scripts/platform/jest-to-vitest.mjs
  catalog/notification` (ADV-20260821-04): `jest.*` → `vi.*`, `jest.requireActual` →
  `await vi.importActual`, tipos `jest.Mock*`/`jest.SpyInstance` → `Mock`/`Mocked`/
  `MockedFunction`/`MockInstance` de `"vitest"`. Filhos em `>=1.0.0 <2.0.0` precisam rodar o
  codemod antes de atualizar.

### Fixed

- `module.json` `schemaExports` não listava `tables/notification.schema` (a declaração
  `pgSchema("notification")`): o snapshot do drizzle-kit gerava `"schemas": {}` e a migração
  baseline não emitia `CREATE SCHEMA "notification"`, quebrando `pnpm catalog:check` em bancos
  novos.

### Security

- `link` dos templates de notificação (`notification-catalog.ts`) restringe o schema a
  `http`/`https` (`z.url({ protocol: /^https?$/ })`) — antes aceitava qualquer scheme, incluindo
  `javascript:`, e o template `button.hbs` interpola o link sem escapar (ADV-20260822-03).
- `SseController` passa a checar o header `Origin` incondicionalmente contra `WEB_ORIGIN`
  (rota GET, isenta de CSRF por padrão) — fecha a leitura cross-origin do stream quando
  `COOKIE_SAMESITE=none`.
- `NODE_ENV` passa a usar o mesmo enum compartilhado do kernel (`nodeEnvSchema` de
  `shared/config/env.ts`, incluindo `staging`) em vez de um enum próprio da entrada.
- A lista de fragmentos redigidos antes de persistir `notification_deliveries.payload`
  (`redactPayload`, sobre `redactSensitive` do kernel) alarga para os mesmos fragmentos sensíveis
  do kernel (`password`, `token`, `secret`, `authorization`, `cookie`, `link`), cobrindo o link do
  e-mail de convite que antes não era redigido no payload persistido.

## [1.0.0]

### Adicionado

- Entrada inicial do catálogo, extraída de `apps/api/src/modules/notification/**`: feed de
  notificações (listar, marcar lida/vista, arquivar, contagem não vista, stream SSE) e entrega
  por e-mail via `EmailChannel` + `Mailer` transport-only (AD-007, AD-008).
- Templates Handlebars de e-mail (`api/infrastructure/mailer/templates/*.hbs`) e o registry de
  fontes de template do base-set (`BASE_TEMPLATE_SOURCES`).
- Testes de paridade (`parity/*.parity.spec.ts` + `contract.snapshot.json`) cobrindo o contrato
  HTTP do feed e as duas decisões de template/mailer.
