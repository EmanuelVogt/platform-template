# Changelog — `notification`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [1.0.0]

### Adicionado

- Entrada inicial do catálogo, extraída de `apps/api/src/modules/notification/**`: feed de
  notificações (listar, marcar lida/vista, arquivar, contagem não vista, stream SSE) e entrega
  por e-mail via `EmailChannel` + `Mailer` transport-only (AD-007, AD-008).
- Templates Handlebars de e-mail (`api/infrastructure/mailer/templates/*.hbs`) e o registry de
  fontes de template do base-set (`BASE_TEMPLATE_SOURCES`).
- Testes de paridade (`parity/*.parity.spec.ts` + `contract.snapshot.json`) cobrindo o contrato
  HTTP do feed e as duas decisões de template/mailer.
