# Changelog — `identity/single-tenant`

Formato [keep a changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
[semver](https://semver.org/lang/pt-BR/). Toda versão que leva código lista os advisories
(`docs/advisories/ADV-*.md`) que carrega.

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
