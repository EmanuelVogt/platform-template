# v1 — Kernel-only template + module catalog — Context

**Gathered:** 2026-08-19
**Spec:** `.specs/features/v1-kernel-only-module-catalog/spec.md`
**Status:** Ready for design

---

## Feature Boundary

The template ships the kernel only (no business-facing module); former base-set modules become copyable catalog entries owned by the child after `platform module add`; module maintenance flows through immutable advisories + an agent skill, never through copier 3-way merge of module code. Executed now in this repo; RituaaliOS#92 re-scoped to "Rituaali adopts v1" afterwards (decision 2026-08-19, reverses the original sequencing).

---

## Implementation Decisions

### GA-1 Catalog location

- `catalog/` folder **in this repo**, listed in `copier.yml` `_exclude` — never rendered into a child.
- Why: kernel × entry tested in the same commit (CI renders a kernel-only child and `module add`s each entry); one PR carries kernel fix + entry change + advisory + CHANGELOG; one harness; `--catalog-ref` defaults to the template tag already in `.copier-answers.yml`.
- Sibling repo rejected: version×version matrix, duplicated harness, two refs for the child. Revisit only if the catalog gains other maintainers.
- Entry version lives in `module.json` + CHANGELOG heading; advisories `affects` target the entry version, not the template tag.

### GA-2 Entry granularity

- One entry per module; a **variant is a sub-entry** (`catalog/identity/single-tenant/`, later `identity/multi-tenant/`); `audit`, `attachment`, `notification`, `tag` are plain entries.
- **No bundle entries.** Composition = `module.json.dependsOn` + `module add --with-deps`. One advisory → one module → one `affects`.
- Lock records `{ name, variant, version }`; advisory `module: identity/single-tenant`.
- Public surface of an entry = `api/facades/*` + `api/events/*` (+ `*.module.ts` for DI), as `module-boundaries.spec.ts` enforces today; `dependsOn` may only name another entry. Known deps: identity → attachment (avatar use-cases; Design decides facade vs kernel storage port), audit → attachment (access-log; leaves the allow-list and goes through the facade).
- Child edits to a copied entry never conflict with copier (files are not template files). Bringing a catalog fix is opt-in via advisory + `port-module-update`; a child-edited hunk stops the skill for that file (no partial apply).

### Env vars of an entry (raised during GA-2)

- `module.json.env[]` = `{ name, example, required, doc }`. `module add` appends a `# <module>` block to `apps/api/.env.example` and, when `.env` exists, appends missing keys with `example` — never overwrites an existing value. Kernel vars (`R2_*`, DB, etc.) are not touched (already in the template's `.env.example`).
- Storage stays kernel, **single bucket** (`R2_BUCKET`); multi-bucket is a deferred idea (would become a kernel `StorageModule` port, not a catalog concern).

### GA-3 Web part of an entry — raw

- Children run Vite **or Next.js** → the web part carries nothing framework-specific.
- `web/core/` (mandatory when the entry has a web part): pure TS — contract-derived types (`CurrentUser`), pure rules (`can(user, key)`, `resolveAccess(user, routeAccess) → "allow" | "anon" | "forbidden"`), the module's `ROUTE_ACCESS` fragment as data. Allowed deps: `zod`, `@platform/api-client`. No `react`, no router.
- `web/react/` (optional, `--no-web-react` skips): `queryOptions`/hooks over `@tanstack/react-query` only. No components, pages, router guards.
- Login form, router wiring (`beforeLoad` / Next `middleware.ts`/layout) = **recipe in README § Web part**, not code.
- `module add` copies `web/**` under `--web-root` (default from `module.json`, e.g. `apps/web/src/entities/<module>/`); never edits a router.
- Generated client is **not shipped**; `module add` runs `pnpm contract` at the end.
- Template web kernel loses `app/router/guards.ts`, `entities/session`, `features/login` (they move to the identity entry as core + recipe); the Vite skeleton stays as minimal demo; "raw web" is a README-contract rule + catalog lint (forbidden imports in `web/`).

### GA-4 Contract pipeline with child-owned routes

- Mechanism unchanged: child's `export-openapi.ts` walks the child's `AppModule`; entry brings only `*.contract.ts` + controllers; `openapi.json` + client are the child's, generated and committed in the child.
- Template ships a kernel-only `openapi.json` (health).
- Each entry carries `parity/contract.snapshot.json` (its operations); parity compares the child's `openapi.json` by operationId (missing op or incompatible schema → parity fails). Advisory `detect` may use it.
- Next children run the same `pnpm contract` (kubb emits TS only).

### GA-5 `tag`

- Catalog entry `catalog/tag/`. Kernel ships zero tables outside `_kernel.*` and zero routes beyond health.

### GA-6 Baseline migration 0000

- Template v1: `0000_kernel_baseline.sql` (`_kernel.*` only) + `0001_kernel_outbox_notify.sql`; v0.2 `0000–0005` leave the template (history lives at tag v0.2.0). Kernel numbering continues `NNNN_kernel_<slug>` from `0002`.
- Entry: `migrations/0000_<module>_baseline.sql` = squash of the entry's current schema, then increments. `module add` renumbers to the end of the child's journal with `when` > last applied; `dependsOn` fixes order (attachment before identity).
- Existing v0.2 children are never rewritten: `module adopt` writes the lock with the entry version whose baseline equals the v0.2 state (documented in changelog v1.0.0); `0000_platform_baseline` stays in their journal forever.
- Product migrations still start at `1000_`. Supersedes AD-005.

### GA-7 Template smoke — keep simple

- **One profile only: `kernel-only`** — existing `scripts/template-smoke.mjs`, fixture `scripts/smoke/fake-product/` retired. Asserts: `pnpm check && pnpm test` green, migrate on empty DB → only `_kernel`, `/health` 200, RULE C zero hits.
- The `module add` path is proven by catalog CI (one job per entry: render kernel-only child → `module add <entry> --with-deps` → `pnpm contract` → `check && test` → parity). No second smoke profile.

### Agent's Discretion

- Exact forbidden-vocabulary list for RULE C; DI token names for the access-policy port; `module.json` JSON schema details; lock file field order; advisory id format (`ADV-YYYYMMDD-NN` default); hook file name; catalog lint implementation (lefthook + unit test over `catalog/**`).

### Declined / Undiscussed Gray Areas → Assumptions

- None declined. All seven GA rows in spec § Assumptions are confirmed; the remaining assumption rows (audit-trail infra → audit entry, decorators stay in kernel, lock shape, advisory id/ledger/hook, entry versioning, `module add` as `pnpm platform …` script) stay as agent defaults.

---

## Specific References

- shadcn/ui `add` model (copy source, own it; `components.json` ↔ `.platform-modules.lock`).
- Current `module-boundaries.spec.ts` rules (facades/events only across modules) as the entry public-surface rule.

---

## Deferred Ideas

- Multi-bucket storage (kernel `StorageModule` port) — only if Rituaali's adoption shows a need.
- A second smoke profile (`kernel+identity`) — dropped for simplicity; catalog CI covers it.
- Sibling `platform-modules` repo — only if the catalog gains external maintainers.
