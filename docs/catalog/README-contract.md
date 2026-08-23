# Catalog entry README contract

Every `README.md` of a catalog entry (`catalog/<name>[/<variant>]/README.md`) follows a
fixed structure of H2 sections (`##`). The `catalog-lint` (script
`scripts/platform/catalog-lint.mjs`) reads the list below as the **single source** of the
required sections and fails if any of them is missing, out of order, or titled differently
from the required literal.

**The order is mandatory.** The sections must appear in the README in exactly this sequence,
with the exact text of each title (no variations in accents, case or punctuation):

```
## Contrato
## Portas do kernel consumidas
## Dados
## Decisões
## Paridade
## Dependências
## Parte web
## Follow-ups absorvidos
```

These heading literals are parsed by `scripts/platform/catalog-lint.mjs` and used by every
entry README under `catalog/**`; they stay in Portuguese until the catalog entries are migrated
together (see follow-up).

## What each section documents

- **`## Contrato`** — table of the HTTP routes exposed by the entry, with columns for method,
  path, `operationId`, events published/consumed and the facades (application services)
  involved.
- **`## Portas do kernel consumidas`** — list of the kernel ports (`shared/kernel/**`,
  `shared/infra/**`) that the entry's adapters implement or consume.
- **`## Dados`** — schema (Drizzle tables in `api/**/tables`), list of the tables the entry
  owns and the manual migrations in `migrations/custom/*.sql` (triggers, functions — never
  table creation, which comes from the TS code).
- **`## Decisões`** — ADR-style list of the entry-specific design decisions; this is where
  the local successors of AD-003/004/007/008/009/010 live when the entry needs a variation
  of those agreements.
- **`## Paridade`** — how to run the parity tests (`parity/*.parity.spec.ts`) and what they
  guarantee (comparison against `contract.snapshot.json`).
- **`## Dependências`** — other catalog entries required via `dependsOn` and the environment
  variables (`env` in `module.json`) that the entry declares.
- **`## Parte web`** — what exists in `web/core` and `web/react` (if any) and integration
  recipes (how to consume the hooks/options in a page or route of the child app).
- **`## Follow-ups absorvidos`** — issues from the v0.2 sweep that this entry absorbed
  (`absorbs` field of `module.json`), with a link or identifier per item.

## Additional rules

- Empty sections are not allowed: if an entry has no web part, the `## Parte web` section
  must state explicitly that it does not apply; it cannot be omitted.
- No section outside this list is mandatory; extra sections may exist after
  `## Follow-ups absorvidos`, but never between the eight above.
