# Changelog do template

Verdade da versão = tag git + esta entrada (AD-006); `package.json` não é incrementado
no release. Cada versão lista as mudanças quebra-contrato e os passos para o filho
aplicar no `copier update`.

## Unreleased

Proposta de tag `v1.1.0`. Nova pergunta do copier `web_stack` (`vite` | `next`, default
`vite`) escolhe o front headless do produto — ver
[`template.md`](template.md#catálogo-de-módulos). Sem passo de migração: `copier update
--defaults` (ou `--skip-answered`) escreve `web_stack: vite` no arquivo de respostas para
filhos existentes, preservando o front Vite atual sem exigir nenhuma ação.

## v1.0.0

O template passa a distribuir só o kernel; os módulos que antes vinham no copier viram
entradas versionadas do catálogo (`catalog/<entry>[/<variant>]/`, fora do template
renderizado), instaladas com `pnpm platform module add` — ver
[`template.md`](template.md#catálogo-de-módulos).

### Breaking changes

1. **Kernel-only; módulos viram entradas de catálogo (AD-013).** Slot files
   (perfis de acesso, catálogos de permissão, perfis de upload) foram retirados —
   AD-001 aposentado. Extensão agora é `dependsOn` entre entradas ou uma porta do kernel,
   nunca mais um slot editado pelo produto.
2. **Seam de acesso do kernel muda de forma.** `ACCESS_REQUIREMENT` (metadata
   `{ kind: "public" | "authenticated" | "permission", key? }`) é a única fonte lida pelo
   guard de acesso do kernel; as chaves antigas de metadata de acesso saem de circulação.
   `SelfService()`/`OptionalAuth()` passam a escrever `ACCESS_REQUIREMENT` diretamente.
   `IS_MACHINE_TO_MACHINE_KEY` sobrevive — é opt-out de CSRF, não requisito de acesso.
   Guard ou decorator próprio do produto que lia as chaves antigas quebra. No web, o tipo
   `RouteAccess` (`apps/web/src/shared/config/route-access.types.ts`) muda de forma:
   `{ kind: "public" } | { kind: "authenticated" } | { kind: "permission"; key: string }` —
   a variante `self` vira `authenticated` e `permission` ganha `key: string`. Produto que
   consome `RouteAccess` direto precisa atualizar os literais.
3. **Log do kernel perde o campo `sessionId`.** A superfície de sessão saiu do kernel; o
   logger não tem mais fonte kernel-safe para recompor esse campo. Produto que dependia de
   `sessionId` correlacionado no log estruturado precisa recompô-lo na própria entrada.
4. **`/docs` remontado sem autenticação.** `GET /docs` deixou de exigir login e de depender
   de módulo — é só a documentação servida em cima do `openapi.json`. Produto que precisa
   do login de volta usa a receita em
   [`template.md`](template.md#receita-docs-protegido-por-login).
5. **Web do kernel perde sessão/login.** A entidade de sessão, o fluxo de login, o guard de
   rota e a página de login saem do template — viram parte da entrada correspondente,
   instalada via `module add` (parte web da entrada + receita de integração no README dela).
6. **Ator no ALS troca de forma.** As funções antigas de acesso/sessão do contexto saem;
   entram `setActor(actor)`/`getActor()` (uma vez, lança na segunda chamada) e
   `setExtension`/`getExtension` (bag genérico por symbol, dono é a entrada que grava).
   No contexto de job, o campo de usuário vira `actorId: string | null`.
7. **Numeração de migrations do kernel reinicia.** O baseline do kernel recomeça em
   `0000_kernel_baseline.sql`; entradas passam a gerar as próprias migrations no produto
   (`drizzle-kit generate`, tabelas como TS + SQL manual só para trigger/função) em vez de
   trazer SQL numerado pronto.

### Passos de migração do filho (`copier update` de v0.2.x)

1. `git status` limpo, depois `copier update` (ou `copier update --vcs-ref v1.0.0`).
2. Para cada módulo da plataforma já presente no produto: `pnpm platform module adopt
<entry> --version <versão-atual>` — registra o `.platform-modules.lock` sem tocar em
   arquivo.
3. Resolva o merge de `_journal.json` como de praxe (ver
   [`numeração de migrations`](template.md#migrations-ad-015)).
4. `pnpm install`.
5. `pnpm contract` (regenera `openapi.json` + cliente com o novo formato de
   `ACCESS_REQUIREMENT` e as rotas afetadas).
6. Reescreva guard/decorator próprio que lia as chaves antigas de acesso para
   `ACCESS_REQUIREMENT`.
7. Se o produto correlaciona log por `sessionId`, adicione uma extension própria no
   contexto de requisição e registre-a explicitamente nos campos de log — o kernel não
   repõe mais esse campo sozinho.
8. Se `/docs` deve continuar atrás de login, aplique a receita de
   [`template.md`](template.md#receita-docs-protegido-por-login).
9. Rode as migrations (`pnpm --filter api db:migrate:run`).

## v0.2.0

Os cinco pontos que antes exigiam editar arquivo de plataforma agora são
slot/registry/porta — ver [`template.md`](template.md#slots-e-registries).

### Breaking changes

1. **`attendsGuests` → `servesClients`** — coluna `identity.users.attends_guests` vira
   `serves_clients` (migration `0004_identity_serves_clients.sql`). Passo: renomeie o
   campo em toda chamada de `createUser`/`updateUser`/`listUsers` do seu produto.
2. **Nomes de perfil de upload** — `feedback-attachment` vira `multi` (migration
   `0005_attachment_generic_upload_profiles.sql`); `credit-receipt`,
   `accommodation-type-image` e `report-artifact` deixam de existir. Env renomeadas:
   `ATTACHMENT_FEEDBACK_MAX_FILE_BYTES`/`ATTACHMENT_FEEDBACK_MAX_TOTAL_BYTES` →
   `ATTACHMENT_MULTI_MAX_FILE_BYTES`/`ATTACHMENT_MULTI_MAX_TOTAL_BYTES`;
   `ATTACHMENT_REPORT_MAX_BYTES` foi removida. Passo: atualize o `.env` e qualquer
   upload do seu produto que ainda use os nomes antigos.
3. **`Mailer` virou porta só de transporte** — `send({ to, subject, html,
idempotencyKey? })`; a renderização saiu do mailer. Passo: se seu produto tem um
   `Mailer` próprio, implemente só `send`; troque fakes de teste para
   `{ send: jest.fn() }`.
4. **Forma da fonte de template mudou** — de `{ template, templateDir, subject }` solto
   para `{ type, catalog, email? }` (`email` carrega `template`, `templateDir?`,
   `subject`, `recipient?`, `view?`). Passo: reescreva todo `register(...)` que seu
   produto faz em `NotificationTemplateSourceRegistry` para a nova forma.
5. **`access-catalog` ganhou `profiles`** — `GET /v1/access-catalog` agora responde
   também `profiles: [{ key, label, assignable }]`. Passo: regenere o cliente
   (`pnpm contract`) antes de consumir a rota.

### Passos de migração do filho (`copier update` de v0.1.0)

1. `git status` limpo, depois `copier update` (ou `copier update --vcs-ref v0.2.0`).
2. Resolva o merge de `apps/api/drizzle/migrations/meta/_journal.json`: se
   `pnpm --filter api db:check:journal` reprovar por causa das entradas `0004`/`0005`
   recebidas da plataforma, reestampe o `when` delas para um valor maior que o da
   última migration já aplicada no filho, preservando a ordem entre `0004` e `0005`
   (ver [`template.md`](template.md#numeração-de-migrations)).
3. `pnpm install`.
4. `pnpm contract` (regenera `openapi.json` + o cliente Kubb com o campo `profiles`).
5. Atualize os fakes de mailer dos testes do produto para `{ send: jest.fn() }` e as
   fontes de template registradas para `{ type, catalog, email? }`.
6. Atualize as env vars de upload do produto (`ATTACHMENT_MULTI_MAX_FILE_BYTES`/
   `ATTACHMENT_MULTI_MAX_TOTAL_BYTES`; remova `ATTACHMENT_FEEDBACK_*` e
   `ATTACHMENT_REPORT_MAX_BYTES`).
7. Rode as migrations (`pnpm --filter api db:migrate:run`) para aplicar `0004`/`0005`.
