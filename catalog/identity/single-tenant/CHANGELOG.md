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

### Alterado (frente à v0.2)

- `AuthGuard` e `PermissionsGuard` deixaram de existir: a decisão de acesso passa pelo
  `AccessGuard` do kernel delegando a `IdentityAccessPolicy`.
- As decisões AD-002 (perfil `professional`), AD-003 (`servesClients`) e AD-004 (enum de perfis
  no banco) passam a ser locais da entrada (ver `README.md` § Decisões).
- Parte web: guards de rota e componentes não são mais entregues como código — viram receitas
  no README (`## Parte web`).

### Advisories

- Nenhum: versão inicial.
