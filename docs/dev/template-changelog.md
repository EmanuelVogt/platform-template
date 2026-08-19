# Changelog do template

Verdade da versão = tag git + esta entrada (AD-006); `package.json` não é incrementado
no release. Cada versão lista as mudanças quebra-contrato e os passos para o filho
aplicar no `copier update`.

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
