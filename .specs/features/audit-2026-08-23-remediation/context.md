# Context — Audit 2026-08-23 Remediation

User decisions on the gray areas surfaced during Specify (2026-08-23). Recorded here so Design and
every worker read the choice and its rationale instead of re-litigating it.

---

## 1. Feature shape — one spec or a sequence

**Gray area.** 52 findings span the CLI, the copier, the kernel, the web shell, the catalog, the
advisories and the harness. They could be one feature with waves, three features per axis, or a
critical-only feature with the highs as backlog.

**Decision — one spec, waves sequenced.** `.specs/features/audit-2026-08-23-remediation/`, all 52
findings, closed by a single Verifier pass.

**Why.** The audit annex is the source of truth for the population being fixed; splitting it into
three features would fork that traceability three ways and make "did we close everything?" a
cross-feature question. A critical-only scope was rejected because six of the nine criticals share
their fix surface with a high (the brand prefix with the api-client seam, the hospitality taxonomy
with `communication.md`, the version collision with the advisory ranges) — the highs would reopen
files the criticals had just closed.

**Consequence.** The spec is large and Execute runs several waves. Priorities inside the spec carry
the sequencing: P1 is what breaks a client product today, P2 what taxes them later, P3 the one
structural change that can ship on its own tag.

---

## 2. The identity entry's clinical slice (F-catalog-entries-6, critical)

**Gray area.** `identity/single-tenant` ships professional areas, services, scheduling areas,
default hours, `serves_clients` and `birth_date` in the generic users schema and in the HTTP
contract. Three ways out: extract the slice into its own entry, hide it behind a product slot, or
keep it and record the debt.

**Decision — extract into a separate catalog entry.** `identity/single-tenant` keeps users, sessions
and permissions. The professional/scheduling tables, their contract fields and the `professional`
profile literal move to a new entry that `dependsOn` identity.

**Why.** AD-014 already made entry internals an entry-local decision, so the extraction needs no
STATE.md supersession fight — but it does need a new AD, because it changes the catalog graph. A
product slot was rejected: the slot keeps clinic vocabulary inside the base entry's contract, so the
generated api-client of every client still carries `schedulingAreaIds`. Keeping it was rejected
because AD-002's own recorded consequence — "removing them is an edit in the child's copy" —
contradicts the platform's `copier update` promise.

**Consequence.** This is the largest single change in the feature: a new entry, its migration story,
a contract regeneration, a `breaking` advisory per affected entry and a new AD. It is P3 in the spec
and sequenced last, after the version/tag machinery of CAT-01..05 exists to publish it correctly.

---

## 3. The pt-BR cluster (6 high findings)

**Gray area.** Brazilian Portuguese is hardcoded across the harness docs, `AGENTS.md`, RFC 7807
error titles, Zod messages, `<html lang>`, URL slugs (`/entrar`, `/inicio`), email templates and
permission labels, with no copier question and no single swap point.

**Decision — a `product_locale` copier question plus one runtime seam per layer.**
`product_locale` defaults to `pt-BR` and templates the language rules in the `.jinja` docs;
at runtime the swap points are `VITE_APP_NAME` / `VITE_LOCALE` on the web, `DEFAULT_LOCALE` on the
API, and one message table per catalog entry.

**Why.** Docs-only leaves every client's users reading Portuguese errors; runtime-only leaves every
client's agents instructed to reply in Portuguese. Switching the default to `en` was rejected
outright: it would re-language every existing pt-BR child at its next `copier update`, which is a
silent production change nobody asked for.

**Consequence.** The default keeps today's behaviour, so an existing child taking this update sees no
string change. The seams are what ship; the English pack is a follow-up unless a client needs it.

---

## 4. The catalog version collision (F-catalog-entries-1/-2/-5)

**Gray area.** Entry version `2.0.0` designates two different codebases (`v2.0.0` pre-remediation,
`v2.1.0` post-remediation), and `ADV-20260822-01..05` declare `affects: >=1.0.0 <2.0.0`, which
excludes exactly the vulnerable children. Fix by bumping the entries, by amending the docs to say
entry versions are addressed only by template tag, or by teaching `computePending` to compare
`lock.catalogRef`.

**Decision — bump, tag, and lint.** Every entry touched by `security-audit-remediation` gets a new
version; the `catalog/<name>[-<variant>]@x.y.z` tags AD-016 promises are cut for the current
versions; the five advisories' `affects` are corrected to name the ambiguous population; and
`catalog:lint` gains a rule that fails when an entry's tree changed since the last stable tag
without a `module.json` bump.

**Why.** Only a bump restores an unambiguous address for "identity 2.0.0", which is what the whole
advisory and `port-module-update` machinery keys on. The `catalogRef` comparison is kept as the
stopgap that makes already-installed `v2.0.0` children detectable (CAT-03), but adopting it as the
only fix would make version ambiguity permanent — the exact hole AD-016's tags were meant to close.

**Consequence.** The release is a kernel major (entry bumps ride with cookie and env renames), and
cutting the entry tags is the user's act through the release workflow — hence CAT-05 is the
feature's single probe rather than a gate.

---

## Defaults chosen by the agent (not discussed, logged as assumptions)

These went undiscussed and are recorded in `spec.md` § *Assumptions & Open Questions* with their
rationale, per the Requirement Closure Gate: canonical API port `3000`; neutral brand prefix `app_`;
`APP_TIMEZONE` defaulting to `UTC`; `STORAGE_*` replacing `R2_*` with an optional module; the
macOS / Linux / WSL2 support matrix with native Windows unsupported; removing
`prettier-plugin-tailwindcss` and adding `format:check` to CI; the release being a kernel major; and
Execute starting only after `template-update-contract` closes.

**Resolved 2026-08-23 — the prettier default is no longer this feature's to choose.** The
`prettier-format-gate` feature (specified and tasked the same day, 11 tasks, all four of its
Assumption rows owner-confirmed) owns the same repair, and the two plans disagreed on the CI seam:
this spec said "add `pnpm format:check` to CI", that one puts the gate in a **template-only**
`.github/workflows/format.yml` and adds nothing to `ci.yml`, because `ci.yml` ships to the child and
a red format job there is a manual migration step AD-034 forbids on a non-major. The confirmed seam
wins and executes first. RUN-04 therefore keeps AC 7 as a regression assertion and this feature's
Design specifies no fix for it — the same shape RUN-05 already has. The one thing Design still
decides: **if** this release ships as a kernel major, whether to promote `format:check` into the
child's `ci.yml` as an explicit migration step. That option is open precisely because
`prettier-format-gate` did not spend it.
