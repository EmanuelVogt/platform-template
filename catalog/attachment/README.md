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

## Portas do kernel consumidas

- `shared/kernel/access/decorators` (`SelfService`, `OptionalAuth`)
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

## Paridade

Os specs em `parity/*.parity.spec.ts` são copiados para
`apps/api/src/modules/attachment/__parity__/` junto com `parity/contract.snapshot.json` e rodam
no jest do app filho:

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
  globalmente pelo `IdentityModule`) para resolver o nome do ator de cada entrada do log.
- `env` (`module.json`): `ATTACHMENT_MAX_UPLOAD_BYTES`, `ATTACHMENT_ACCESS_LOG_RETENTION_DAYS`,
  `ATTACHMENT_MULTI_MAX_FILE_BYTES`, `ATTACHMENT_MULTI_MAX_TOTAL_BYTES`.

## Parte web

Esta entrada não distribui nenhuma parte web — não há `web/core` nem `web/react`.

## Follow-ups absorvidos

Nenhum. `module.json.absorbs` está vazio.
