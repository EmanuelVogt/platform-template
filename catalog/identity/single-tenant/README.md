# `identity/single-tenant`

Autenticação e autorização de tenant único. Sessão em cookie `HttpOnly`, dispositivos
confiáveis, fluxos de senha/e-mail por token, perfis de acesso em enum do banco e catálogo de
permissões. É a entrada que liga a porta `ACCESS_POLICY` do kernel — sem ela o `AccessGuard`
responde 403 `access-policy-missing` em toda rota não pública.

Instalação: `pnpm platform module add identity --variant single-tenant --with-deps`.

## Contrato

Prefixo global `/v1`. `Acesso` é a `AccessRequirement` que o `AccessGuard` do kernel lê;
`authenticated` sem metadata explícita vem do default fail-closed do kernel (`@SelfService()`).

| Método | Path                                      | operationId                | Acesso                                         | Eventos                  | Facades                   |
| ------ | ----------------------------------------- | -------------------------- | ---------------------------------------------- | ------------------------ | ------------------------- |
| POST   | `/v1/auth/login`                          | `login`                    | public                                         | `notification.requested` | —                         |
| POST   | `/v1/auth/forgot-password`                | `forgotPassword`           | public                                         | `notification.requested` | —                         |
| POST   | `/v1/auth/reset-password`                 | `resetPassword`            | public                                         | `notification.requested` | —                         |
| POST   | `/v1/auth/set-password`                   | `setPassword`              | public                                         | `notification.requested` | —                         |
| POST   | `/v1/auth/verify-email`                   | `verifyEmail`              | public                                         | —                        | —                         |
| GET    | `/v1/auth/access-link`                    | `validateAccessLink`       | public                                         | —                        | —                         |
| POST   | `/v1/auth/access-link/cancel`             | `cancelAccessLink`         | public                                         | —                        | —                         |
| POST   | `/v1/auth/access-link/avatar`             | `uploadAccessLinkAvatar`   | public                                         | —                        | `PROFILE_IMAGE_STORE`     |
| GET    | `/v1/auth/email-change`                   | `validateEmailChange`      | public                                         | —                        | —                         |
| POST   | `/v1/auth/confirm-email-change`           | `confirmEmailChange`       | public                                         | —                        | —                         |
| GET    | `/v1/auth/session`                        | `getSession`               | authenticated                                  | —                        | —                         |
| POST   | `/v1/auth/logout`                         | `logout`                   | authenticated                                  | —                        | —                         |
| POST   | `/v1/auth/change-password`                | `changePassword`           | authenticated                                  | `notification.requested` | —                         |
| POST   | `/v1/auth/resend-verification`            | `resendVerification`       | authenticated                                  | `notification.requested` | —                         |
| GET    | `/v1/auth/access-history`                 | `accessHistory`            | authenticated                                  | —                        | —                         |
| PATCH  | `/v1/auth/profile`                        | `updateMyProfile`          | authenticated                                  | —                        | —                         |
| POST   | `/v1/auth/avatar`                         | `uploadAvatar`             | authenticated                                  | —                        | `PROFILE_IMAGE_STORE`     |
| POST   | `/v1/auth/change-email`                   | `requestEmailChange`       | authenticated                                  | `notification.requested` | —                         |
| GET    | `/v1/auth/devices`                        | `listDevices`              | authenticated                                  | —                        | —                         |
| DELETE | `/v1/auth/devices`                        | `revokeOtherDevices`       | authenticated                                  | —                        | —                         |
| DELETE | `/v1/auth/devices/{id}`                   | `revokeDevice`             | authenticated                                  | `notification.requested` | —                         |
| GET    | `/v1/access-catalog`                      | `getAccessCatalog`         | authenticated                                  | —                        | —                         |
| GET    | `/v1/admin/users`                         | `listUsers`                | permission `admin.users.read`                  | —                        | —                         |
| POST   | `/v1/admin/users`                         | `createUser`               | permission `admin.users.create`                | `notification.requested` | —                         |
| PUT    | `/v1/admin/users/{id}`                    | `updateUser`               | permission `admin.users.update`                | —                        | —                         |
| DELETE | `/v1/admin/users/{id}`                    | `deleteUser`               | permission `admin.users.delete`                | —                        | —                         |
| POST   | `/v1/admin/users/restore`                 | `restoreUsers`             | permission `admin.users.trash.restore`         | —                        | —                         |
| POST   | `/v1/admin/users/purge`                   | `purgeUsers`               | permission `admin.users.trash.purge`           | —                        | `AuditTrailPurger` (port) |
| POST   | `/v1/admin/users/{id}/resend-access-link` | `resendAccessLink`         | permission `admin.users.access_link.resend`    | `notification.requested` | —                         |
| GET    | `/v1/admin/permission-templates`          | `listPermissionTemplates`  | permission `admin.permission_templates.read`   | —                        | —                         |
| POST   | `/v1/admin/permission-templates`          | `createPermissionTemplate` | permission `admin.permission_templates.create` | —                        | —                         |
| GET    | `/v1/admin/permission-templates/{id}`     | `getPermissionTemplate`    | permission `admin.permission_templates.read`   | —                        | —                         |
| PUT    | `/v1/admin/permission-templates/{id}`     | `updatePermissionTemplate` | permission `admin.permission_templates.update` | —                        | —                         |
| DELETE | `/v1/admin/permission-templates/{id}`     | `deletePermissionTemplate` | permission `admin.permission_templates.delete` | —                        | —                         |

Facades **exportadas** para outras entradas: `UserDirectoryFacade` (nome/e-mail/avatar por id),
`UsageAccessFacade` (checagem de uso antes de apagar) e `ProfessionalDirectoryFacade` (usuários
que atendem cliente). `IdentityModule` é `global: true` e exporta o token `ACCESS_POLICY`.

Porta **consumida** pela entrada e ligada por quem quiser: `PROFILE_IMAGE_STORE`
(`shared/kernel/profile-image/profile-image-store.port`), com `upload`, `delete` e `exists` para as
imagens de perfil. É opcional e resolvida com `@Optional()`: sem provider registrado, `uploadAvatar`,
`uploadAccessLinkAvatar` e `setPassword` **quando** recebe `avatarAttachmentId` respondem `501`
com `type` `.../auth/profile-image-store-missing`; login, sessão, administração de usuários e o
`setPassword` sem avatar continuam funcionando.

Todo evento sai pelo outbox do kernel (`notification.requested`, consumido pela entrada
`notification`); a trilha própria da entrada é a tabela `identity.auth_events` (§ Dados).

## Portas do kernel consumidas

| Porta / adapter do kernel                                                                                              | Uso na entrada                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access/access-policy.port` (`ACCESS_POLICY`, `AccessRequirement`)                                                     | `IdentityAccessPolicy` implementa e o módulo liga o token                                                                                                                    |
| `profile-image/profile-image-store.port` (`PROFILE_IMAGE_STORE`, `ProfileImageStore`)                                  | `uploadAvatar`, `uploadAccessLinkAvatar` e `setPassword` resolvem com `@Optional()`; quem liga é outra entrada                                                               |
| `audit-trail/audit-trail-purger.port` (`AUDIT_TRAIL_PURGER`, `AuditTrailPurger`)                                       | `purgeUsers` resolve com `@Optional()`; sem provider a purga da trilha é no-op                                                                                               |
| `access/decorators` (`@Public`, `@SelfService`, `@RequirePermission`, `@MachineToMachine`)                             | metadata de acesso das 34 rotas                                                                                                                                              |
| `context/request-context` (`setActor`, `setExtension`)                                                                 | `AuthMiddleware` publica `Actor` + `IDENTITY_SESSION` / `IDENTITY_ACCESS`                                                                                                    |
| `clock/clock`, `clock/bucket-sql`                                                                                      | TTLs de sessão/token e janelas de rate limit                                                                                                                                 |
| `rate-limit/rate-limiter.port` (`RATE_LIMITER`)                                                                        | `RateLimitGuard` (`@RateLimit` em 27 rotas) e o throttle de login por conta; limiter resiliente composto (Redis + fallback local), ligado pelo `RateLimitModule` `@Global()` |
| `outbox/outbox.publisher`                                                                                              | `notification.requested` na mesma transação do caso de uso                                                                                                                   |
| `transactional/*`, `use-case/*`, `idempotency/idempotent.decorator`                                                    | transação, decorators de caso de uso e idempotência                                                                                                                          |
| `listing/*` (`apply-listing`, `listing-query.schema`, `paginated`)                                                     | paginação de `listUsers`, `accessHistory`, `listPermissionTemplates`                                                                                                         |
| `errors/forbidden.error`, `logging/logger.factory`, `tracing/traced.decorator`, `scheduling/maintenance-job.decorator` | erros RFC 7807, log, tracing e jobs de manutenção                                                                                                                            |
| `infra/database/drizzle.provider`, `infra/redis/redis.provider`                                                        | repositórios Drizzle e rate limiter em Redis                                                                                                                                 |

Os dois acoplamentos de kernel v0.2 que a v1 tinha de desfazer estão desfeitos: o catálogo de
perfis/permissões voltou para `api/domain/access/` desta entrada e o purge da trilha em
`purgeUsers` virou a porta `AUDIT_TRAIL_PURGER`, ligada pela entrada `audit`.

## Dados

Schema `identity`. As tabelas são código TS (`api/infrastructure/tables/**`) e o `drizzle-kit`
do child gera o SQL de criação — a entrada nunca entrega `CREATE TABLE` numerado.

| Tabela                                                                                                                                                                                                               | Papel                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `identity.users`                                                                                                                                                                                                     | conta, perfil de acesso, status, contadores de bloqueio, avatar |
| `identity.user_permissions`                                                                                                                                                                                          | permissões concedidas por usuário                               |
| `identity.permission_templates` / `identity.permission_template_permissions`                                                                                                                                         | modelos de permissão reutilizáveis                              |
| `identity.sessions`                                                                                                                                                                                                  | sessões ativas (idle/absolute TTL, remember-me)                 |
| `identity.devices`                                                                                                                                                                                                   | dispositivos conhecidos por usuário                             |
| `identity.verification_tokens`                                                                                                                                                                                       | tokens de reset, verificação, primeiro acesso e troca de e-mail |
| `identity.auth_events`                                                                                                                                                                                               | trilha append-only de autenticação                              |
| `identity.user_professional_areas`, `identity.user_professional_services`, `identity.user_scheduling_areas`, `identity.user_professional_schedule_configs` (+ slots e blocks), `identity.professional_default_hours` | recorte do perfil `professional` (AD-002)                       |

Tipos de `identity.auth_events.type`: `login_success`, `login_failed`, `logout`,
`password_changed`, `password_set`, `password_reset_requested`, `password_reset_completed`,
`email_verified`, `email_change_requested`, `email_changed`, `access_link_sent`,
`access_link_resent`, `access_link_cancelled`, `device_revoked`, `sessions_revoked_all`,
`rate_limited_burst`, `rate_limiter_degraded`, `user_deleted`, `user_restored`, `user_purged`.

Migrações manuais (`migrations/custom/`, aplicadas nesta ordem, depois das tabelas):

- `01_auth_events_append_only.sql` — `REVOKE UPDATE, TRUNCATE` + trigger
  `auth_events_append_only` que bloqueia `UPDATE` sempre e `DELETE` a menos que a transação
  ligue o GUC `app.auth_events_purge=on` (o job de retenção liga; SQLi precisaria do
  `set_config` na mesma transação).
- `04_audit_attach_hook.sql` — declara `identity.attach_audit()`, a função idempotente com as
  14 tabelas do identity que vão para a trilha da entrada `audit` (`users` com `password_hash`
  redigido, `sessions` com `token_hash`, `devices` com `cookie_token_hash`,
  `verification_tokens` com `token_hash`, `permission_templates` +
  `permission_template_permissions`, `user_permissions` e as seis tabelas do recorte
  `professional`). Cada módulo declara as suas tabelas: a entrada `audit` entrega o schema, a
  tabela, o helper `audit.attach` e o replay dos hooks, nunca a lista de quem é auditado.
  `identity.auth_events` fica de fora de propósito — já tem trilha própria (01).

  A entrada `audit` é **opcional**: `identity.attach_audit()` é guardada por
  `to_regprocedure('audit.attach(text,text,text[],text[])') IS NULL`, então um child
  kernel-only + identity migra sem erro e sem anexar nada — por isso `audit` não entra em
  `dependsOn`. Quem executa a função quando a entrada existe é a migração
  `02_attach_module_hooks.sql` do próprio `audit`, no fim da instalação dela (o inverso — child
  que já tem `audit` e adiciona o identity depois — é coberto pelo `PERFORM` no fim de
  `04_audit_attach_hook.sql`). Quem instalar `audit` depois do
  identity precisa reexecutar este passo; `audit.attach` é idempotente (recria o trigger
  `audit_row`), então reaplicar é seguro.

## Decisões

Sucessoras locais das decisões que viviam no `STATE.md` do template (AD-014 as moveu para cá).

### AD-002 (local) — o perfil `professional` fica dentro da entrada

**Contexto**: `professional` é um perfil de acesso com dados próprios (áreas de atuação,
serviços, escala, horários padrão) que a v0.2 mantinha no módulo identity.
**Decisão**: o recorte inteiro (`user_professional_*`, `professional_default_hours`,
`ProfessionalDirectoryFacade`, `ProfessionalAssignmentFacade` e o slot
`professional-assignment.module.ts`) fica nesta entrada, não vira entrada separada.
**Consequência**: um child que não tem profissionais herda tabelas vazias; removê-las é uma
edição na cópia dele, sem impacto no catálogo. Uma variante futura sem `professional` é uma
entrada nova (`identity/single-tenant-lite`), não um flag.

### AD-003 (local) — `servesClients` não deriva do perfil

**Contexto**: "quem atende cliente" e "qual o perfil de acesso" foram tratados como a mesma
coisa até recepção e agendista também passarem a atender.
**Decisão**: `identity.users.serves_clients` é coluna própria, `boolean not null default false`,
independente de `access_profile`.
**Consequência**: seletores, mapas e escala filtram por `servesClients`; nenhuma regra pode
inferir atendimento a partir do perfil. Coberto por `parity/profiles.parity.spec.ts`.

### AD-004 (local) — perfis de acesso são enum do banco

**Contexto**: o perfil precisa ser válido no banco, não só no TypeScript.
**Decisão**: `identity.access_profile` é `pgEnum` (`master`, `admin`, `professional`); acrescentar
um perfil exige migração `ALTER TYPE ... ADD VALUE` no child.
**Consequência**: `master` é curinga — não carrega permissões explícitas e `can()` o libera
sempre, no back (`IdentityAccessPolicy`) e no front (`web/core/permissions.ts`). Coberto por
`parity/profiles.parity.spec.ts` e `web/core/permissions.test.ts`.

### AD-017 (local) — autorização por middleware + policy, não por guard próprio

**Contexto**: a v0.2 tinha `AuthGuard` + `PermissionsGuard` dentro do identity.
**Decisão**: `AuthMiddleware` resolve a sessão e publica `Actor` + extensões na ALS do kernel,
sem nunca rejeitar; quem rejeita é o `AccessGuard` do kernel delegando a `IdentityAccessPolicy`.
**Consequência**: a policy lança `401` quando não há ator (o `AccessGuard` só sabe transformar
`false` em `403`, e a v0.2 respondia 401 para sessão ausente). Ausência da extensão
`IDENTITY_ACCESS` nega — fail closed. Coberto por `parity/access-policy.parity.spec.ts`.

### AD-025 (local) — o e2e cruzado mora na entrada a jusante do DAG

**Contexto**: vários e2e são testes de integração ENTRE entradas — precisam de usuário semeado
com hash real e de sessão por `/v1/auth/login`, que só o identity entrega. Espalhados, eles
fechavam o único ciclo do grafo de entradas: cinco e2e do `notification` e um do `tag`
importavam `RATE_LIMITER`, que na época morava nesta entrada (hoje é porta do kernel, §
Portas do kernel consumidas), e o identity importa `NotificationRequested` do `notification`
em dez use-cases de produção.
**Decisão**: um e2e cruzado fica na entrada que **depende**, nunca na dependência. Como
`identity → notification` é a direção do DAG, os quatro e2e cruzados que viviam no
`notification` (`notifications-email`, `notifications-feed`, `notifications-inapp`,
`notifications-sse`) passaram para `api/__e2e__/` desta entrada; `audit`, `attachment` e `tag`
mantêm os seus, porque já dependem do identity. Os helpers que eles compartilham ficam em
`api/testing/` desta entrada (`seed-user.ts`, `allow-all-rate-limiter.ts`) mais `fakeMailer`,
reexportado de `notification/api/testing/fake-mailer.ts` — nunca no harness de kernel
`apps/api/test/setup/`, que não pode conhecer token de entrada.
**Consequência**: `notification` volta a ser raiz limpa do DAG (nenhum arquivo seu, de produção
ou teste, importa outra entrada) e o grafo fica acíclico incluindo testes. A suíte e2e desta
entrada pressupõe `notification` instalado — o que já era verdade pelo `fakeMailer` e é
coerente com o `dependsOn: notification` declarado no `module.json` (T22l).

## Paridade

`parity/*.parity.spec.ts` roda como suíte unitária do child depois do `module add` (os arquivos
vão para `apps/api/src/modules/identity/__parity__/`):

```
pnpm --filter api test -- src/modules/identity/__parity__
```

O que cada suíte garante:

- `contract.parity.spec.ts` — o `openapi.json` do child ainda contém as 34 operações de
  `contract.snapshot.json`, por `operationId`, com os mesmos campos obrigatórios de
  request/response. Operação extra no child é permitida; sumiço ou mudança de campo obrigatório
  reprova.
- `route-access.parity.spec.ts` — a exigência de acesso de cada uma das 34 rotas (public /
  authenticated / permission `<chave>`), reconstruída da metadata `ACCESS_REQUIREMENT`. Rota nova
  sem linha na tabela reprova, e nenhuma rota pode depender do default fail-closed do kernel:
  `@SelfService()` escreve `authenticated` explicitamente.
- `access-policy.parity.spec.ts` — `IdentityAccessPolicy`: público sem ator, 401 em rota
  autenticada sem ator, curinga do `master`, OR de `anyPermission`, fail-closed sem extensão.
- `csrf.parity.spec.ts` — `CsrfGuard`: métodos seguros passam, Origin/Referer conferidos contra
  `WEB_ORIGIN`, double-submit exigido em rota autenticada com `SameSite=none` e dispensado em
  rota pública ou máquina-a-máquina.
- `profiles.parity.spec.ts` — enum `identity.access_profile` com os três perfis e `serves_clients`
  independente.

Além da paridade, a entrada entrega as suítes e2e da v0.2 em `api/__e2e__/` (vão para
`apps/api/src/modules/identity/__e2e__/`, cobertas pelo projeto `api-e2e` — `pnpm vitest run
--config vitest.integration.mts --project api-e2e` — do child) e o material de harness em
`api/testing/` — `seed-user.ts`, `allow-all-rate-limiter.ts` e `seeds/` (bootstrap do usuário
`master`), mais `fakeMailer` reexportado de `notification/api/testing/fake-mailer.ts`.
`seed-user.ts` e `allow-all-rate-limiter.ts` são a superfície que `audit`, `attachment` e `tag`
importam por `dependsOn` (AD-021/AD-025); `fakeMailer` é a mesma superfície para os e2e cruzados
que precisam de `MAILER` sem depender de `notification` diretamente. O plumbing do runner
(containers, env, `test-db`) continua em `apps/api/test/`, do kernel.

Duas ressalvas: `docs-login.e2e-spec.ts` da v0.2 não voltou — o kernel passou a montar `/docs`
sem autenticação e sem acoplamento com módulo, então a rota que a suíte exercia deixou de
existir; a variante com login vira receita no child, não código da entrada. E os seis e2e de
e-mail (`access-link-activation`, `auth-outbox-email`, `authz`, `create-user-flow`, `user-trash`,
`verify-email`) ainda importam a porta `MAILER` da entrada `notification` — coupling de teste
registrado em `notification/api/testing/fake-mailer.ts`, reexportado por `api/testing/index.ts`
desta entrada, e pendente de mudança fora desta entrada.

Regerar o snapshot depois de mudar rota da entrada: extraia do `openapi.json` do template as
operações de tags `Auth`, `Session`, `Device`, `Admin` e `Access` e grave em
`parity/contract.snapshot.json` — e abra um advisory (`kind: breaking`) descrevendo a mudança.

## Dependências

`dependsOn: [{ name: "notification", range: ">=1.0.0 <2.0.0" }]` no `module.json`: a entrada
**não** instala sozinha num filho só com o kernel — ela importa `notification` em produção e em
teste (ver mais abaixo e § Decisões, AD-025).

A antiga aresta para `attachment` virou porta: `identity.module.ts` não importa mais o
`AttachmentModule` e os três casos de uso (`upload-avatar`, `upload-access-link-avatar` e
`set-password`) resolvem `PROFILE_IMAGE_STORE` com `@Optional()` (§ Contrato). O token e a
interface moram no kernel (AD-024), não nesta entrada: um token declarado dentro do consumidor
obrigaria o provedor a importar o consumidor, que é exatamente a aresta que a porta existe para
cortar. Quem liga a porta hoje é a entrada `attachment`, que continua declarando
`dependsOn: identity` (usa `UserDirectoryFacade`) — a aresta agora tem um sentido só e o grafo de
instalação é acíclico.

Sem a entrada `attachment` (ou qualquer outro provider de `PROFILE_IMAGE_STORE`) o
`IdentityModule` resolve normalmente no boot; só as operações de imagem de perfil respondem `501`.

A entrada `audit` **não** é dependência: `migrations/custom/04_audit_attach_hook.sql` só declara
`identity.attach_audit()`, guardada, que não faz nada quando `audit.attach` não existe (§ Dados). O purge LGPD da trilha em `purgeUsers` também
virou porta — `AUDIT_TRAIL_PURGER` (`shared/kernel/audit-trail/audit-trail-purger.port.ts`, no
kernel pela AD-024), resolvida com
`@Optional()`. Quem liga é a entrada `audit`; sem provider a purga da trilha é no-op, e não `501`
como em `PROFILE_IMAGE_STORE`, porque sem a entrada `audit` não existe trilha guardando o PII do
titular — o hard delete do usuário já é completo.

A entrada `notification` **é** dependência, declarada no `module.json`.
Dez casos de uso de produção importam `NotificationRequested` de `modules/notification`, o
`notification/api/testing/fake-mailer.ts` (reexportado por `api/testing/index.ts` desta entrada)
importa a porta `Mailer`, e os quatro e2e cruzados que chegaram por AD-025 importam `MAILER` e
`DeliveryDispatcher`. Sob AD-025 a aresta é declarada, não invertida:
`identity → notification` é a direção do DAG (`notification` é a raiz e não importa ninguém), e
promover `NotificationRequested`/`MAILER` a porta do kernel colocaria vocabulário de módulo no
kernel — o que a RULE C proíbe. O que continua verdade é que **publicar** no outbox não exige
consumidor: sem a entrada instalada o evento fica sem quem o processe.

Variáveis de ambiente (campo `env` do `module.json`, anexadas ao `.env.example` pelo
`module add`). Obrigatórias: `WEB_ORIGIN`, `PASSWORD_PEPPER` (≥32 caracteres),
`BREACH_CHECK_MODE` (`fail_open` | `fail_closed`, sem default de propósito) e
`BREACH_CHECK_ENABLED` (sem default: esquecer de configurar não pode virar "não checa
vazamento"). `CSRF_SECRET` passa a ser obrigatória quando `COOKIE_SAMESITE=none`. As demais
(cookie, TTLs de sessão e token, throttle de login por conta, cooldowns, parâmetros do argon2,
teto de hashes em voo, política de senha, retenção da trilha, seed do usuário master) têm
default e estão documentadas uma a uma no `module.json`.

## Parte web

`defaultRoot` = `apps/web/src/entities/identity`. A entrada entrega **código sem framework de
rota e sem componente**; tela, roteador e store são receitas abaixo.

`web/core` (TS puro; só `zod` e `@platform/api-client`):

- `session.types.ts` — `CurrentUser`, derivado do DTO gerado (`CurrentUserResponseDto["user"]`).
- `permissions.ts` — `PermissionKey` e `can(user, key)`; `master` é curinga (AD-004).
- `route-access.ts` — `RouteAccess` (`public` | `authenticated` | `permission`) e
  `IDENTITY_ROUTE_ACCESS`, o fragmento do mapa rota → acesso que a entrada contribui
  (`/` e `/entrar` públicos, `/inicio` autenticado).
- `resolve-access.ts` — `resolveAccess(user, access)` → `"allow" | "anon" | "forbidden"`. Função
  pura, testada em `*.test.ts`, que substitui os guards `requireAccess`/`requireAnon` da v0.2.
- `session.fixture.ts` — `makeCurrentUser()` para os testes do child.

`web/react` (soma `@tanstack/react-query`):

- `session.queries.ts` — `sessionKeys`, `sessionQueryOptions` (fonte única do `user`:
  `retry: false`, `staleTime: Infinity`), `useSession`, `useLogin` (injeta o usuário no cache no
  sucesso) e `useLogout` (limpa o cache).
- `use-can.ts` — `useCan()`, versão reativa do `can`.

### Receita: guard de rota no TanStack Router

`beforeLoad` da rota chama `resolveAccess` com a sessão do cache e traduz a decisão em
`redirect`. Registrado via `registerAppGuard` (`@/app/router/shell`) — nenhum arquivo do
template (`shell.tsx`, `main.tsx`, `app-providers.tsx`) precisa ser editado:

```ts
import { redirect } from "@tanstack/react-router"

import { resolveAccess } from "@/entities/identity/core/resolve-access"
import { sessionQueryOptions } from "@/entities/identity/react/session.queries"
import { ROUTES } from "@/shared/config/routes"

import type { RouteAccess } from "@/entities/identity/core/route-access"
import type { QueryClient } from "@tanstack/react-query"

async function currentUser(queryClient: QueryClient) {
  try {
    const { user } = await queryClient.ensureQueryData(sessionQueryOptions)
    return user
  } catch {
    return null
  }
}

export async function requireAccess(
  queryClient: QueryClient,
  access: RouteAccess,
  intendedPath: string
): Promise<void> {
  const decision = resolveAccess(await currentUser(queryClient), access)
  if (decision === "anon") {
    useAuthStore.getState().setRedirectIntent(intendedPath)
    throw redirect({ to: ROUTES.LOGIN })
  }
  if (decision === "forbidden") {
    throw redirect({ to: ROUTES.INICIO })
  }
}
```

O `access` da rota vem do `staticData` do match ou de `IDENTITY_ROUTE_ACCESS[path]`. Mande o
`forbidden` para uma rota `authenticated` (nunca para uma rota por permissão), senão o redirect
entra em laço. Para a tela de login, a v0.2 usava `requireAnon`: com sessão no cache, redirecione
para o destino logado em vez de renderizar o formulário.

Registre o guard uma vez, no bootstrap da entidade:

```ts
import { registerAppGuard } from "@/app/router/shell"

registerAppGuard(({ queryClient, pathname }) =>
  requireAccess(
    queryClient,
    IDENTITY_ROUTE_ACCESS[pathname] ?? { kind: "authenticated" },
    pathname
  )
)
```

Os outros dois seams do template: `registerUnauthorizedExemption` (mesmo módulo) isenta o 401
esperado do probe de sessão de `sessionQueryOptions` — sem isso, o `onUnauthorized` do api-client
trataria toda checagem de sessão como logout; `AppProviders` (`@/app/providers/app-providers`)
aceita um `ProductProviders` opcional para providers de contexto do produto. Nenhum dos três
exige editar `shell.tsx`, `main.tsx` ou `app-providers.tsx`.

### Receita: Next.js (`middleware.ts` + `src/_app/layout/access-slot.tsx`)

O `middleware` roda no edge, sem o cache do React Query: ele só decide o que dá para decidir
pelo cookie de sessão — presença do cookie contra `ROUTE_ACCESS[pathname]`. A checagem
de permissão fica no `AccessGuard` de `src/_app/layout/access-slot.tsx`, que já tem a sessão:

```ts
import { NextResponse } from "next/server"

import { ROUTE_ACCESS } from "@/shared/config/route-access"

import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const access = ROUTE_ACCESS[request.nextUrl.pathname] ?? {
    kind: "authenticated",
  }
  const hasSession = request.cookies.has(
    process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME!
  )
  if (access.kind !== "public" && !hasSession) {
    return NextResponse.redirect(new URL("/entrar", request.url))
  }
  return NextResponse.next()
}
```

No `AccessGuard` de `src/_app/layout/access-slot.tsx`, busque `GET /v1/auth/session` no servidor
e aplique `resolveAccess(user, access)` — `forbidden` vira `notFound()` ou um redirect; `anon` vira
redirect para o login. Nunca confie só no middleware: cookie presente não é sessão válida.

### Receita: formulário de login

A entrada não entrega componente. O formulário do child usa `useLogin` e valida com `zod` sobre
o schema gerado (`loginDtoSchema`). Esqueleto da v0.2, sem design system:

```tsx
const { register, handleSubmit } = useForm<LoginInput>({
  resolver: zodResolver(loginSchema),
  defaultValues: { email: "", password: "", rememberMe: true },
})
const login = useLogin()

const onSubmit = handleSubmit((data) => {
  login.mutate(
    { data },
    { onSuccess: () => navigate({ to: resolveAuthedTarget() }) }
  )
})
```

Três pontos que costumam ser esquecidos ao reescrever a tela:

- **CSRF é transporte, não formulário.** O interceptor do `@platform/api-client` reflete o cookie
  CSRF no header `X-CSRF-Token` em todo método mutante; o formulário não faz nada.
- **Destino pós-login.** O guard guarda a intenção antes de redirecionar para o login; consuma e
  limpe essa intenção no `onSuccess`, senão o próximo login repete o destino antigo.
- **Logout entre abas.** `useLogout` limpa o cache da aba atual; avisar as outras (BroadcastChannel)
  é do child — a entrada não embute store.

## Follow-ups absorvidos

Nenhum. `module.json.absorbs` está vazio — nenhum dos follow-ups do sweep v0.2 foi corrigido na
extração desta entrada. Os issues que os rastreavam (#2–#8) foram excluídos; o débito não tem
dono nem registro vivo — quem reabrir a frente decide caso a caso.
