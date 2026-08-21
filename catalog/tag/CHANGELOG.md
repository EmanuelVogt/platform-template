# Changelog — `tag`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [1.0.0]

### Adicionado

- Entrada inicial do catálogo, extraída de `apps/api/src/modules/tag/**`: CRUD de tags, lixeira
  (stash/restore), purge definitivo e contagem de uso agregada via `TagUsageRegistry`.
- `migrations/custom/01_audit_attach_tags.sql` — encaixe (guardado) da tabela `tags` na trilha
  de auditoria genérica, extraído de `apps/api/drizzle/migrations/0003_audit_trail.sql`.
- Testes de paridade (`parity/*.parity.spec.ts` + `contract.snapshot.json`) cobrindo o contrato
  HTTP e a superfície pública de `TagDirectoryFacade`/`TagUsageRegistry`.
