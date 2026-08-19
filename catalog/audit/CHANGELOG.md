# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [1.0.0]

### Adicionado

- Entrada `audit`: leitura paginada da trilha (`GET /v1/audit`), painel de uso
  (`UsageActivityFacade`) e registry de extensão (`AuditRegistry`).
- Fold do antigo módulo, repositório e job de purge da trilha, que viviam no
  kernel compartilhado, para `api/infrastructure/trail/**` — a entrada passa
  a ser dona da escrita de manutenção/retenção, não só da leitura.
