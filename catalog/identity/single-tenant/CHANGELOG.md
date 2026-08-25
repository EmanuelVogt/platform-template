# Changelog — `identity/single-tenant`

Formato [keep a changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
[semver](https://semver.org/lang/pt-BR/). Toda versão que leva código lista os advisories
(`docs/advisories/ADV-*.md`) que carrega.

## [3.0.0]

### Breaking

- Requer o kernel 3.x: a entrada deixa de suportar o kernel 2.x — o `kernelRange` abre
  para `>=3.0.0 <4.0.0` no corte da `v3.0.0`, e um child em kernel 2.x não instala mais
  esta versão.
- Exige `notification` 3.x: o `dependsOn` abre para `>=3.0.0 <4.0.0`. As cinco entradas
  se movem juntas na `v3.0.0`, então um child não instala mais esta versão ao lado de um
  `notification` 2.x.
- Nomes de cookie neutros: `COOKIE_NAME` passa a `__Host-app_session`,
  `DEVICE_COOKIE_NAME` a `__Host-app_device` e o cookie de CSRF a `app_csrf` — este
  último deixa de ser literal e passa a sair da configuração da entrada. Trocar o nome
  invalida toda sessão viva no deploy; ver `ADV-20260824-03`.
- `CLINIC_TZ` some da entrada: a agregação por dia/semana lê `APP_TIMEZONE` (IANA,
  default `UTC`).
- `COOKIE_SAMESITE=none` com a API em host diferente do host de `WEB_ORIGIN` passa a ser
  recusado no boot, em vez de emitir um cookie que o browser descarta.
- A fatia profissional sai da entrada e vira a entrada `professional`. `identity.users`
  perde `serves_clients` e `birth_date`; as cinco satélites (`user_professional_areas`,
  `user_professional_services`, `user_scheduling_areas`,
  `user_professional_schedule_configs` e `professional_default_hours`) saem do
  `schemaExports`; `createUser`, `updateUser`, `listUsers`, `setPassword` e
  `updateMyProfile` perdem `areaIds`, `serviceIds`, `schedulingAreaIds` e `birthDate`;
  `IdentityModule.forRoot()` não aceita mais o slot `professional`; e `professional` sai
  do conjunto base de `identity.access_profile`. `identity.attach_audit()` registra as 7
  tabelas próprias — as 7 profissionais passam a `professional.attach_audit()`. Migração
  de dado obrigatória antes de derrubar as colunas: ver `ADV-20260824-01`.

### Fixed

- `drizzle-usage-stats.reader.spec.ts`: o import de `TransactionManager` vinha depois do import
  irmão do leitor e o `captured.bucket as SQL` removia `undefined` por asserção de tipo
  (`import-x/order`, `@typescript-eslint/non-nullable-type-assertion-style`).
- `identity.config.spec.ts`: o teste "não exige API_ORIGIN fora de COOKIE_SAMESITE=none"
  afirmava só `toBeUndefined()` — passava sob um parse que ignorasse `COOKIE_SAMESITE`. Agora
  afirma também o `lax` que o parse devolve (`platform/no-existence-only-assert`, L-007).
- Os três reprovavam o `pnpm check` de todo filho que instala a entrada: `catalog/` está fora de
  toda invocação de ESLint do template, então o desvio só aparece no filho. Ver
  `ADV-20260825-02`.
- Specs de e2e: os nomes de cookie de marca `rit_session`/`rit_device` — anteriores à
  generificação — ficaram parados em 17 pontos de 6 arquivos enquanto os defaults desta mesma
  versão rendem `app_session`/`app_device`; dois comentários ainda afirmavam
  "e2e-env usa COOKIE_NAME=rit_session", falso desde o rename.
- `auth-csrf-none.e2e-spec.ts`: a suíte montava `COOKIE_SAMESITE=none` sem declarar `API_ORIGIN`,
  e o refine fail-closed desta versão recusava o setup da única suíte que prova CSRF sob
  `SameSite=none`. Agora ela declara `API_ORIGIN` no host de `WEB_ORIGIN` e lê os nomes de cookie
  da config que monta, em vez de literais. O `afterAll` fechava o app sem guarda, transformando
  qualquer falha de setup num segundo erro espúrio que escondia a causa.
- `drizzle-usage-stats.reader.int-spec.ts`: as asserções embutem `-03:00` no bucket esperado, mas
  o default do kernel passou a `UTC` nesta versão; o spec agora declara o `APP_TIMEZONE` que
  testa.
- Os quatro reprovavam o `pnpm test:db` de todo filho que instala a entrada — 14 falhas. Ver
  `ADV-20260825-03`.

## [2.1.3]

### Fixed

- Os 17 `not.toThrow(<erro>)` que a 2.1.2 colocou nos guards `void` provam menos que a forma
  sem argumento: no Vitest esse matcher afirma só "não lançou _este_ tipo" e passa quando o
  código lança outro erro — um `TypeError` no caminho válido de `assertValidPermissionSet`
  mantinha os quatro testes de aceitação verdes. Cada um passa a usar `not.toThrow()` sem
  argumento mais a asserção que discrimina a aceitação: a variação mínima da mesma entrada
  que precisa ser recusada (`assertValidPermissionSet`, `assertProfileFloor`,
  `assertCanGrant`, `validatePasswordPolicy`, `assertPermission` e a suíte de paridade).

## [2.1.2]

### Fixed

- 31 testes da entrada afirmavam só existência (`toBeDefined`/`toBeUndefined`/`toBeTruthy`/
  `not.toThrow()`) e passariam sob uma implementação errada. Cada um passa a afirmar o
  resultado que pretende provar: o `User` ativado (data e status), o `schema` que o
  `LoginDto` expõe, o `Retry-After` do 429, o token opaco do link de acesso, o aparelho
  corrente devolvido por `GET /auth/devices`, o `type` do 409 ao revogar o device atual, as
  chamadas de escrita das solicitações de troca de e-mail fora do cooldown, o vínculo
  preservado pelo no-op de `removeByServiceIds` e a única chave da feature `usage`. Nos
  guards `void` (`assertValidPermissionSet`, `assertProfileFloor`, `assertCanGrant`,
  `validatePasswordPolicy`, `assertPermission`, construtor do `HmacCsrf`) a asserção passa a
  nomear o erro que não pode ser levantado. Sem a correção,
  `platform/no-existence-only-assert` reprovava `pnpm check` em todo filho que instala a
  entrada.

## [2.1.1]

### Fixed

- `README.md`: três referências tratavam `api/testing/fake-mailer.ts` como arquivo desta
  entrada — o arquivo mora em `notification/api/testing/fake-mailer.ts` desde a v2.1.0
  (`test-suite-refactor` T17) e é reexportado por `api/testing/index.ts`. Sem mudança de
  código; a versão sobe porque REL-04 exige que qualquer mudança no diretório da entrada
  desde a tag anterior mova a versão, inclusive uma mudança só de documentação.

## [2.1.0]

### Added

- Barril `testing/index.ts`: `seedUser` (com `accessProfile: "master"` rebaixando
  o master anterior), `loginAs`, `tokenFromMail`, `makeUser`, `makeIdentityConfig`,
  `emails`/`seedEmail`, `allowAllRateLimiter`, `fakeMailer` e as constantes
  `FIXED_NOW`/`TEST_PASSWORD` do harness do kernel. Os specs da entrada e das
  entradas que dependem dela passam a importar daqui em vez de redefinir cada
  helper por arquivo.

### Changed

- `identity.config.fixture.ts` passou de `modules/identity/` para
  `modules/identity/testing/` e é reexportado pelo barril. **Migração no filho:**
  trocar `from "../../identity.config.fixture"` por
  `from "../../testing/identity.config.fixture"` (ou importar `makeIdentityConfig`
  do barril) nos specs que a usam.
- `allow-all-rate-limiter.ts` virou reexport do limiter do harness do kernel
  (`shared/test/e2e/app`) — implementação uma só.
- Os e2e da entrada (`api/__e2e__/**`) bootam pelo `createE2eApp` do harness do
  kernel e usam `resetDb`, `withE2ePool`, `drainOutbox`, `expectProblem`,
  `cookieValue` e o barril `testing/` no lugar do bootstrap, do limiter, do
  login, do extrator de cookie, do `linkFromHtml` e do `waitFor` que cada
  arquivo redefinia. **Migração no filho:** um e2e local copiado da entrada
  continua funcionando; para adotar o harness, trocar
  `Test.createTestingModule(...)` por `await createE2eApp()` e
  `truncateIdentity(pool)` por `resetDb(pool, ["identity", "_kernel"])`.

## [2.0.2]

### Changed

- Sem mudança de código. Corrige o `affects` de `ADV-20260822-01` para
  `>=1.0.0 <2.0.1` e registra por que `2.0.1` é o primeiro endereço inequívoco.
  A versão sobe porque REL-04 exige que qualquer mudança no diretório da entrada
  desde a tag anterior mova a versão — inclusive uma mudança apenas de changelog.

## [2.0.1]

### Changed

- Reformatação mecânica pelo `prettier` (config reparada em `prettier-format-gate`). Sem
  mudança de comportamento, versão de dependência ou conteúdo do manifesto. Sem advisory.
- Não carrega remediação nova, mas passa a ser o limite superior do `affects` de
  `ADV-20260822-01` (CAT-01): antes dela, `2.0.0` desta entrada endereçava duas árvores de
  código diferentes — uma sob a tag do template `v2.0.0`, outra sob `v2.1.0` (183 arquivos
  divergem entre elas em `catalog/`). `2.0.1` é a primeira versão com endereço inequívoco.

## [2.0.0]

### Breaking

- Specs migradas de Jest para Vitest via `node scripts/platform/jest-to-vitest.mjs
catalog/identity/single-tenant` (ADV-20260821-03): `jest.*` → `vi.*`, `jest.requireActual` →
  `await vi.importActual`, tipos `jest.Mock*`/`jest.SpyInstance` → `Mock`/`Mocked`/
  `MockedFunction`/`MockInstance` de `"vitest"`. `dependsOn` notification sobe para
  `>=2.0.0 <3.0.0`. Filhos em `>=1.0.0 <2.0.0` precisam rodar o codemod antes de atualizar.
- `BREACH_CHECK_ENABLED` deixa de ter default e passa a ser obrigatória: esquecer de configurar
  não pode mais virar silenciosamente "não checa vazamento" (auditoria 2026-08-22, AUTH-1,
  ADV-20260822-01).
- A porta `RATE_LIMITER` sai desta entrada e sobe para o kernel
  (`shared/kernel/rate-limit/rate-limiter.port`), com o limiter resiliente composto (Redis +
  fallback local) ligado pelo `RateLimitModule` `@Global()`. Todo importador do antigo
  `domain/ports/rate-limiter.ts` local re-aponta para o token do kernel — mecânico, sem mudança
  de comportamento para quem só injeta `RATE_LIMITER`.
- `BreachCheck.check` formaliza o veredito em três estados (`BreachVerdict`: `clear` | `breached`
  | `skipped`), separando "não vazada" de "não deu para saber" — a falha do provedor HIBP sob
  `fail_open` já não se confunde com "senha limpa".
- `EmailBelongsToDeletedUserError` foi removida: `request-email-change` (AUTH-10) unifica os dois
  tipos de 409 que a v2.0.0 anterior distinguia, e o cooldown por conta passa a valer também na
  falha, não só no sucesso.
- `identity.auth_events.type` ganha o literal `rate_limiter_degraded`, emitido quando o
  `RateLimiterOutageListener` detecta o composite em modo de fallback.
- O bootstrap do usuário master de cada módulo instalado passa a rodar via um glob descoberto
  pelo entrypoint do kernel (`dist/modules/*/seeds/bootstrap.js`), não mais por um script único
  do template; esta entrada contribui `api/seeds/bootstrap.ts`, compilado para
  `dist/modules/identity/seeds/bootstrap.js`.

### Fixed

- `module.json` `schemaExports` não listava `tables/identity.schema` (a declaração
  `pgSchema("identity")`): o snapshot do drizzle-kit gerava `"schemas": {}` e a migração
  baseline não emitia `CREATE SCHEMA "identity"`, quebrando `pnpm catalog:check` em bancos novos.
- `user_professional_services.created_at` usava `defaultNow()` (hora de início da transação, não
  por linha): um `INSERT` em lote de vários vínculos (`replaceForService`) empatava o
  `created_at` de todas as linhas, e `listByServiceIds` desempatava por `user_id` (ULID), sem
  relação com a ordem de inserção — exposto por `pnpm catalog:check attachment` (identity como
  dependência), nunca pelo `catalog:check identity` isolado. Passa a usar `clock_timestamp()`
  (ADV-20260821-03).
- `migrations/custom/02_audit_attach.sql` e `03_audit_redact_token_hashes.sql` **removidos**,
  substituídos por `04_audit_attach_hook.sql`. Os dois chamavam `audit.attach` direto sob um
  guard "entrada audit ausente" que, na prática, era **sempre** verdadeiro: a entrada `audit`
  declara `dependsOn: identity`, então a ordem topológica do instalador gera as migrações do
  identity antes das do audit e `audit.attach` ainda não existe quando elas rodam — um filho
  recém-gerado nascia com a trilha vazia para todo o identity, inclusive sem a redação de
  `users.password_hash`, `sessions.token_hash`, `devices.cookie_token_hash` e
  `verification_tokens.token_hash` (auditoria de segurança 2026-08-22, ADV-20260822-01). O novo
  arquivo só **declara** a lista, na função idempotente `identity.attach_audit()`; quem a executa
  é `audit.attach_module_hooks()`, no fim da instalação da entrada `audit`. Um filho sem `audit`
  segue migrando sem erro e sem anexar nada, e um filho que já tem `audit` anexa na hora (o
  `PERFORM` no fim do arquivo).

## [1.0.0]

Primeira publicação da entrada no catálogo — extração do módulo `identity` do template v0.2,
já adaptado ao kernel v1 (porta `ACCESS_POLICY`, ator na ALS, guards do kernel).

### Adicionado

- `api/**`: módulo Nest completo (34 rotas, use cases, domínio, adapters Drizzle/Redis/argon2)
  com as suítes unitárias e de integração que já existiam no template.
- `api/access/identity-access.policy.ts`: implementação de `AccessPolicy` ligada ao token
  `ACCESS_POLICY` do kernel; substitui o `PermissionsGuard` da v0.2.
- `api/middleware/auth.middleware.ts`: publica `Actor` e as extensões `IDENTITY_SESSION` /
  `IDENTITY_ACCESS` na ALS do kernel; nunca rejeita — quem rejeita é o `AccessGuard`.
- `web/core`: `CurrentUser`, `can`, `IDENTITY_ROUTE_ACCESS` e `resolveAccess` (TS puro, testado).
- `web/react`: `sessionQueryOptions`, `useSession`, `useLogin`, `useLogout`, `useCan`.
- `migrations/custom/01_auth_events_append_only.sql`: trigger append-only de
  `identity.auth_events` com escape hatch de retenção.
- `parity/`: 5 suítes de paridade contra a v0.2 + `contract.snapshot.json` (34 operações).
- `api/__e2e__/`: 17 suítes e2e da v0.2 (login, logout, sessão, devices, verificação de e-mail,
  link de acesso, lixeira, authz, CSRF `SameSite=none`, rate limit, idempotência, outbox de
  e-mail, anti-enumeração, catálogo e histórico de acesso).
- `api/testing/`: `seed-user.ts`, `fake-mailer.ts` e `seeds/` (bootstrap do usuário `master`).
- `api/domain/ports/audit-trail-purger.ts`: porta `AUDIT_TRAIL_PURGER` para o purge LGPD da
  trilha em `purgeUsers` — ligada pela entrada `audit`, `@Optional()` (AD-021).

### Alterado (frente à v0.2)

- `AuthGuard` e `PermissionsGuard` deixaram de existir: a decisão de acesso passa pelo
  `AccessGuard` do kernel delegando a `IdentityAccessPolicy`.
- As decisões AD-002 (perfil `professional`), AD-003 (`servesClients`) e AD-004 (enum de perfis
  no banco) passam a ser locais da entrada (ver `README.md` § Decisões).
- Parte web: guards de rota e componentes não são mais entregues como código — viram receitas
  no README (`## Parte web`).
- `auth-events.purge` e `email-change.revert` passam a se registrar no `MaintenanceRegistry` do
  kernel (AD-022), com o mesmo cron e os mesmos `lockId` (5 e 4) da v0.2.
- `CsrfGuard` e as suítes de paridade leem `ACCESS_REQUIREMENT`; `IS_PUBLIC_KEY` e
  `IS_SELF_SERVICE_KEY` deixaram de existir no kernel.
- `docs-login.e2e-spec.ts` da v0.2 não foi reposto: o `/docs` do kernel deixou de ser protegido
  por login e de conhecer módulo, então a rota que a suíte exercia não existe mais.
- A dependência direta em `AttachmentFacade` para o avatar de perfil foi invertida: `identity`
  passa a consumir a porta `PROFILE_IMAGE_STORE`/`ProfileImageStore` do kernel, implementada
  pela entrada `attachment` (AD-024, T17c).

### Advisories

- Nenhum: versão inicial.
