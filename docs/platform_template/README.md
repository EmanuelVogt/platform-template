# Análises internas do template

Pasta exclusiva do repositório do template: `copier.yml` exclui `/docs/platform_template`
e a guarda é `scripts/platform/__tests__/template-internal-docs.test.mjs`. Nada aqui chega
a um produto gerado.

## O que está aqui

| Arquivo | Conteúdo |
| --- | --- |
| `audit-2026-08-23.html` | Relatório navegável — filtro por severidade e busca, com evidência `arquivo:linha`, correção e veredito por achado |
| `audit-2026-08-23.json` | Os mesmos achados como dados (`confirmed`, `refuted`, `duplicates`, `coverage`) — greppável e consumível por agente |

## Auditoria 2026-08-23 — HEAD `ab7685f`, tag `v2.1.0`

Varredura de product-agnosticism e robustez do harness com 35 agentes (14 dimensões,
crítico de completude, 5 sondas); cada achado passou por verificação adversarial de lente
cética + impacto. 252 achados brutos → **195 confirmados**, 4 refutados, 52 duplicatas.

| Severidade | Confirmados |
| --- | --- |
| Crítico | 9 |
| Alto | 43 |
| Médio | 77 |
| Baixo | 66 |

### Os 9 críticos

1. `.agents/skills/creating-issues/SKILL.md.jinja` e `docs/agents/issue-tracker.md.jinja` — taxonomia fechada de labels de hotelaria imposta a todo produto (2 achados)
2. `apps/api/src/openapi/openapi-config.ts` — prefixo de marca `rit_` em cookies, storage do front e no `openapi.json` commitado
3. `apps/api/src/shared/kernel/clock/bucket-sql.ts` — `CLINIC_TZ = 'America/Sao_Paulo'` fixo; agregação por dia/semana errada fora do Brasil
4. `catalog/identity/single-tenant/module.json` — domínio clínico/agendamento embutido na entrada
5. `catalog/identity/single-tenant/module.json` — versão `2.0.0` designa dois códigos distintos entre as tags `v2.0.0` e `v2.1.0`
6. `docs/agents/infra.md.jinja` — infraestrutura real do dono entregue ao cliente como se fosse a dele
7. `docs/dev/local-environment.md` — backfill do MySQL legado do dono; o comando citado não existe
8. `scripts/platform/lib/catalog-graph.mjs` — todo `pnpm platform` quebra no produto: importa `lib/lint.mjs`, excluída do copier

### Consultar

```
open docs/platform_template/audit-2026-08-23.html
jq -r '.confirmed[] | select(.final_severity=="critical") | "\(.file): \(.title)"' docs/platform_template/audit-2026-08-23.json
jq -r '.confirmed[] | select(.finder=="hooks-robustness") | "\(.file): \(.title)"' docs/platform_template/audit-2026-08-23.json
jq -r '.coverage[] | "\(.key): \(.coverage)"' docs/platform_template/audit-2026-08-23.json
```

Campos de cada achado: `title`, `file`, `line`, `final_severity`, `kind`, `evidence`,
`why`, `recommendation`, `verdict_reason`, `finder`.

## Próxima auditoria

Salve o resultado como `audit-<data>.{html,json}` nesta pasta e acrescente uma linha na
tabela acima. O formato do JSON é o retorno do workflow de auditoria: `summary`,
`confirmed`, `refuted`, `duplicates`, `unverified`, `coverage`.
