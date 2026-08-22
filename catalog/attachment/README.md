# Catálogo — `attachment`

Upload, download e log de acesso de anexos genéricos (perfis `avatar`, `access-link-avatar`,
`document`, `image`, `multi`). Publicada em `apps/api/src/modules/attachment/**` quando um app
filho roda `pnpm platform module add attachment`.

## Contrato

| Método | Path | operationId | Eventos | Use case / facade |
| --- | --- | --- | --- | --- |
| POST | `/v1/attachments/uploads` | `uploadAttachments` | — | `UploadAttachmentsBatchUseCase` |
| GET | `/v1/attachments/{id}` | `downloadAttachment` | — | `GetAttachmentForDownloadUseCase` |

A entrada não publica nem consome eventos de domínio.

Além das duas rotas HTTP, `AttachmentFacade` (exportada pelo `AttachmentModule`) expõe, para
consumo em processo por outras entradas do catálogo: `upload`, `delete`, `confirmUploads`,
`openForDownload`, `exists`, `describeByIds` e `listAccessLog(attachmentId)`. Esse último método
é o ponto de consulta ao log de acesso usado pela entrada `audit`.

O `AttachmentModule` é `@Global()` e liga a porta `PROFILE_IMAGE_STORE` do kernel
(`AttachmentProfileImageStore`, em `api/adapters/`, sobre a própria `AttachmentFacade`). O token e a
interface moram no kernel (AD-024), não na entrada consumidora: é assim que a identidade guarda
avatar sem que nenhuma das duas entradas importe a outra por causa da porta. Sem esta entrada
instalada, a identidade sobe igual e apenas as rotas de avatar respondem `501`.

## Portas do kernel consumidas

- `shared/kernel/access/decorators` (`SelfService`, `OptionalAuth`)
- `shared/kernel/profile-image/profile-image-store.port` (`PROFILE_IMAGE_STORE`,
  `ProfileImageStore`) — esta entrada é o **provedor**: liga o token com
  `AttachmentProfileImageStore`
- `shared/kernel/http/content-disposition`
- `shared/kernel/context/request-context`
- `shared/kernel/errors/domain.error`
- `shared/kernel/transactional/transaction-manager` e `transactional.decorator`
- `shared/kernel/clock/clock`
- `shared/kernel/logging/logger.factory`
- `shared/kernel/scheduling/maintenance-job.decorator`
- `shared/kernel/tracing/traced.decorator`
- `shared/kernel/use-case/use-case` e `use-case.decorator`
- `shared/infra/database/drizzle.provider`
- `shared/infra/storage/object-storage.port` (`StorageModule`, bucket único) — permanece no
  kernel; esta entrada apenas consome a porta, não copia a implementação.

## Dados

Schema Postgres dedicado `attachment` (`infrastructure/tables/attachment.schema.ts`), com três
tabelas Drizzle em `api/infrastructure/tables/`: `attachment.table.ts`,
`attachment-acl.table.ts` e `attachment-access-log.table.ts`. As tabelas nascem do código TS —
`migrations/custom/` está vazio porque não há trigger ou função manual necessária hoje.

## Decisões

- **AD-010 (sucessora, local a esta entrada)** — perfis de upload genéricos: `avatar`,
  `access-link-avatar`, `document`, `image`, `multi`. O antigo perfil de produto
  `feedback-attachment` virou `multi` (roteável via upload genérico, aceita qualquer byte, até
  100 arquivos, `restricted`); os perfis `credit-receipt`, `accommodation-type-image` e
  `report-artifact` foram removidos — o mais próximo do antigo teto de relatório sobrevive no
  perfil `document` (`accept: "any"`, 1 arquivo, `restricted`). As variáveis
  `ATTACHMENT_FEEDBACK_MAX_FILE_BYTES`/`TOTAL_BYTES` viraram `ATTACHMENT_MULTI_MAX_FILE_BYTES`/
  `TOTAL_BYTES`; `ATTACHMENT_REPORT_MAX_BYTES` foi descartada. Produtos que precisarem de um
  perfil próprio estendem `PRODUCT_UPLOAD_PROFILES` em `api/domain/upload/product-upload-profiles.ts`
  (local a esta entrada — antes vivia no kernel, em `kernel/upload/**`).
- **AD-025 — os e2e desta entrada seguem aqui.** `attachment-delete.e2e-spec.ts` e
  `attachment-download.e2e-spec.ts` semeiam usuário e fazem login por `/v1/auth/login` para
  chegar às rotas autenticadas de anexo. É aresta `attachment → identity`, já declarada em
  `dependsOn` — e o e2e cruzado mora na entrada a jusante do DAG, em quem depende. Ambos passaram
  a importar `seedUser` (e `allowAllRateLimiter`, no de delete) de `identity/api/testing/`, e não
  mais de um harness compartilhado em `apps/api/test/setup/`, que não pode conhecer token de
  entrada. Nenhum ciclo: `identity` não importa `attachment`.

## Paridade

Os specs em `parity/*.parity.spec.ts` são copiados para
`apps/api/src/modules/attachment/__parity__/` junto com `parity/contract.snapshot.json` e rodam
via `pnpm vitest run --project api apps/api/src/modules/attachment` no app filho:

- `contract.parity.spec.ts` — compara `openapi.json` do filho contra `contract.snapshot.json`
  via `expectContractSubset`, garantindo que `uploadAttachments` e `downloadAttachment`
  continuam presentes com os mesmos campos obrigatórios (lê `openapi.json` a partir de
  `process.cwd()`).
- `upload-profiles.parity.spec.ts` — fixa as regras da AD-010: os cinco nomes de perfil base,
  quais perfis são roteáveis (`document`, `image`, `multi`) e a forma exata dos perfis `multi`,
  `avatar`/`access-link-avatar`/`image`.
- `access-log.parity.spec.ts` — fixa o contrato de `AttachmentFacade.listAccessLog(attachmentId)`
  e a forma de uma entrada do log de acesso, usado por entradas consumidoras (ex.: `audit`).

## Dependências

- `dependsOn`: `identity` (`>=1.0.0 <2.0.0`) — `list-attachment-access-log.use-case.ts` injeta
  `UserDirectoryFacade` (de `modules/identity/api/facades/user-directory.facade`, montada
  globalmente pelo `IdentityModule`) para resolver o nome do ator de cada entrada do log. Esta
  entrada também liga `PROFILE_IMAGE_STORE`, a porta de imagem de perfil que mora no kernel e
  `identity` consome (§ Contrato) — ligar a porta não cria aresta para `identity`. `identity` declara
  `dependsOn: notification`, não `attachment`, então não há ciclo: só `attachment → identity →
  notification`.
- `env` (`module.json`): `ATTACHMENT_MAX_UPLOAD_BYTES`, `ATTACHMENT_ACCESS_LOG_RETENTION_DAYS`,
  `ATTACHMENT_MULTI_MAX_FILE_BYTES`, `ATTACHMENT_MULTI_MAX_TOTAL_BYTES`.

## Parte web

Esta entrada não distribui nenhuma parte web — não há `web/core` nem `web/react`.

## Follow-ups absorvidos

Nenhum. `module.json.absorbs` está vazio.
