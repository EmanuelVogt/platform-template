# Catálogo — `notification`

Feed de notificações (listar, marcar lida/vista, arquivar, contagem não vista, stream SSE) e
entrega assíncrona por e-mail via canal + mailer transport-only. Publicada em
`apps/api/src/modules/notification/**` quando um app filho roda
`pnpm platform module add notification`.

## Contrato

| Método | Path | operationId | Eventos | Use case / facade |
| --- | --- | --- | --- | --- |
| GET | `/v1/notifications` | `listNotifications` | — | `ListNotificationsUseCase` |
| GET | `/v1/notifications/unseen-count` | `unseenCount` | — | `GetUnseenCountUseCase` |
| POST | `/v1/notifications/seen` | `markAllSeen` | — | `MarkAllSeenUseCase` |
| POST | `/v1/notifications/read-all` | `markAllRead` | — | `MarkAllReadUseCase` |
| POST | `/v1/notifications/{id}/read` | `markRead` | — | `MarkReadUseCase` |
| POST | `/v1/notifications/{id}/archive` | `archiveNotification` | — | `ArchiveNotificationUseCase` |

Além das rotas acima, `GET /notifications/stream` expõe um endpoint SSE
(`stream/sse.controller.ts`) marcado `@ApiExcludeEndpoint` — fora do OpenAPI, consumido via
`EventSource` pelo front. A entrada consome o evento externo que dispara notificações
(`NotificationRequestedHandler`, escutando o evento de domínio publicado por outros módulos) mas
não publica eventos de domínio próprios.

## Portas do kernel consumidas

- `shared/config/env`
- `shared/infra/database/drizzle.provider`
- `shared/infra/redis/redis.provider`
- `shared/kernel/context/request-context`
- `shared/kernel/errors/forbidden.error`
- `shared/kernel/events/domain-event.base`
- `shared/kernel/listing/listing-query.schema` e `shared/kernel/listing/paginated`
- `shared/kernel/logging/logger.factory`
- `shared/kernel/scheduling/maintenance-job.decorator`
- `shared/kernel/transactional/transaction-manager`

## Dados

Schema Postgres dedicado `notification` (`infrastructure/tables/notification.schema.ts`), com
duas tabelas Drizzle em `api/infrastructure/tables/`: `notification.table.ts` (tabela
`notifications`) e `notification-delivery.table.ts` (tabela `notificationDeliveries`, com os
enums `notificationDeliveryStatus` e `notificationChannel`). As tabelas nascem do código TS —
`migrations/custom/` está vazio porque não há trigger ou função manual necessária hoje.

## Decisões

- **AD-007, forma da fonte de template de notificação (sucessora, local a esta entrada).** Uma
  fonte registrada é `{ type, catalog, email? }`, onde
  `email = { template, templateDir?, subject(data), recipient?(data), view?(data) }`.
  `templateDir` ausente → pasta `templates` do próprio módulo notification (`infrastructure/mailer/templates`);
  `recipient` ausente → `data.email` (precisa ser string); `view` ausente → identidade (o
  `payload` inteiro vai pro renderer). Os tipos do base-set (`BASE_TEMPLATE_SOURCES`) se
  registram pelo mesmo `NotificationTemplateSourceRegistry` que o produto usa para contribuir os
  próprios tipos — `EmailChannel` e o renderer resolvem todo tipo do mesmo jeito, sem código
  por tipo. Isso quebrava produtos v0.1 que registravam `{ template, templateDir, subject }` no
  nível raiz (fora de `email`).
- **AD-008, `Mailer` é transport-only (sucessora, local a esta entrada).** A porta expõe só
  `send({ to, subject, html, idempotencyKey? })`. A renderização acontece em `EmailChannel`
  (resolve binding → recipient → subject → template → chama o mailer). Dublês de teste
  implementam um único método. `LogMailer` registra `to`, `subject`, `idempotencyKey` e os
  `href`s extraídos do HTML, para o fluxo de dev manter o link cru no log.
- **AD-025, os e2e cruzados saíram desta entrada.** `notification` é a raiz do DAG: `identity`
  importa `NotificationRequested` em dez use-cases de produção, então declarar
  `dependsOn: identity` aqui fecharia ciclo. Quatro e2e que viviam em `api/__e2e__/`
  (`notifications-email`, `notifications-feed`, `notifications-inapp`, `notifications-sse`)
  precisavam de sessão autenticada: eles semeiam usuário com hash real e fazem login por
  `/v1/auth/login` — rotas e tabelas do `identity`. A regra aplicada: **um e2e cruzado mora na
  entrada a jusante no DAG**, ou seja em quem depende, nunca na dependência. Os quatro foram
  movidos para `catalog/identity/single-tenant/api/__e2e__/` com o mesmo nome; eles seguem
  cobrindo o feed, o SSE, os produtores in-app e o cutover de e-mail, agora do lado que
  legitimamente pode importar as duas entradas. Nenhum teste foi enfraquecido ou removido.
- **O único e2e que sobra aqui não toca `identity`.** `notifications-product-extension` publica
  `NotificationRequested` direto no outbox com `recipientId: ulid()` e não faz nenhuma request
  HTTP; o `overrideProvider(RATE_LIMITER)` que ele carregava era peso morto herdado de quando
  tudo morava junto e foi removido. `notification.notifications.recipient_id` e
  `notification.notification_deliveries.recipient_id` são `text` sem FK para `identity.users`
  (`infrastructure/tables/notification.table.ts:10` e `notification-delivery.table.ts:21`), o que
  torna esse e2e instalável e executável com a entrada sozinha.

## Paridade

Os specs em `parity/*.parity.spec.ts` são copiados para
`apps/api/src/modules/notification/__parity__/` junto com `parity/contract.snapshot.json` e
rodam via `pnpm vitest run --project api apps/api/src/modules/notification` no app filho:

- `contract.parity.spec.ts` — compara `openapi.json` do filho contra `contract.snapshot.json`
  via `expectContractSubset`, garantindo que as seis operações do feed continuam presentes com
  os mesmos campos obrigatórios (lê `openapi.json` a partir de `process.cwd()`). Não existe
  `openapi.json` estático versionado neste repositório — o snapshot foi extraído dos decorators
  `@ApiOperation`/`@Controller` dos controllers, não de um arquivo gerado; por isso as respostas
  do snapshot ficam deliberadamente rasas (sem schema de campo obrigatório), no mesmo padrão do
  `downloadAttachment` da entrada `attachment`.
- `template-registry.parity.spec.ts` — fixa a AD-007: forma da fonte registrada, os tipos do
  base-set passando pelo mesmo registry, e os três defaults (`recipient` → `data.email`, `view`
  → identidade, `templateDir` → pasta própria do módulo).
- `mailer.parity.spec.ts` — fixa a AD-008: a porta `Mailer` só tem `send(message)` de um
  argumento, e `LogMailer` registra `to`/`subject`/`idempotencyKey`/`links` (hrefs extraídos do
  HTML).

Os helpers de teste da entrada ficam em `api/testing/` — `fakeMailer`, `DELIVERY_DISPATCHERS`,
`findSent`, `makeNotification` e `sample-templates/`. `identity` importa os quatro por
`dependsOn: notification` (AD-025) e reexporta `fakeMailer` do próprio `api/testing/index.ts`, para
que `audit`/`attachment`/`tag` o obtenham sem depender de `notification` diretamente.

## Dependências

- `dependsOn`: nenhuma, e agora isso vale também para os testes — nenhum arquivo desta entrada,
  de produção ou de teste, importa `identity`, `attachment`, `audit` ou `tag`. É a raiz do DAG de
  entradas e precisa continuar assim: `identity` depende dela, então qualquer aresta de volta
  fecharia ciclo (ver § Decisões, AD-025).
- `env` (`module.json`): `MAIL_TRANSPORT`, `RESEND_API_KEY`, `MAIL_FROM`,
  `DELIVERY_MAX_ATTEMPTS`.

## Parte web

Esta entrada não distribui nenhuma parte web — não há `web/core` nem `web/react`.

## Follow-ups absorvidos

Nenhum. `module.json.absorbs` está vazio.
