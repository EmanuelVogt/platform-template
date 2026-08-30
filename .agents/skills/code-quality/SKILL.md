---
name: code-quality
description: Mandatory cross-cutting code-quality rules for apps/api and apps/web — comments, naming, typing, errors, async, lint/format and PR scope. Required reading before writing any code in this repo; also use when reviewing a diff against the code-review checklist.
---

# Code Quality — Mandatory Rules

Cross-cutting. Applies to `apps/api` and `apps/web`. **Required reading before writing any code.** Every rule here fails the PR if violated. Area architecture: `../backend-architecture/SKILL.md`, `../frontend-architecture/SKILL.md`.

## Principles

1. **YAGNI** — do not implement for a hypothetical future. 3 identical lines > premature abstraction.
2. **Surgery, not rewrite** — an edit focuses on what changes. Adjacent refactor only when it reduces the risk of the fix.
3. **Trust the types** — no redundant defensive code where the type/framework guarantees it. A real boundary (external input, IO, parse) still needs handling.
4. **No compatibility shim** — change it directly. No feature flag for something that does not get reverted.
5. **No comments by default** — well-named code explains itself.
6. **Fixed language** — see [`AGENTS.md`](../../../AGENTS.md) (Tripwires → Language).

## Comments

**Default: ZERO.** A comment is an exception the author justifies. No valid case pointed out → defect, review deletes it. A file with comments in several blocks fails the PR.

**Deletion test — one "yes" deletes:**

1. Would a better name eliminate the need? → rename.
2. Does the type/signature already guarantee it? → redundant.
3. Do `git blame` + the commit carry it (reason, author, PR, date)? → it goes in the commit.

**Valid cases (CLOSED list — 4):**

1. Non-obvious invariant the type does not capture — `// requires ORDER BY id ASC; the cursor depends on it`.
2. Workaround for an external bug, with a reference — `// Safari <17: requestIdleCallback does not fire in a background tab`.
3. Domain constraint outside the adjacent code — `// CPF may have leading zeros — keep it a string`.
4. Counterintuitive decision another dev "would fix" — `// intentional sleep: Meta rate limit = 1 req/s`.

Not one of the 4 → badly named/badly structured code, fix the cause.

**AI comments — delete on sight.** These fail the PR: step narration (`// Step 1`, `// Now loop`), restating the line (`// increment counter`), paraphrasing a symbol, block summary, banner/separator, JSDoc that repeats the signature, `// TODO: implement`. When reviewing AI output: delete every generated comment, re-justify from scratch whatever you keep.

**Boy-scout when editing.** Touched a file → audit the pre-existing comments of the **region you changed** against the 4 cases and delete the noise (especially AI-generated) in the same edit. Scope = the touched region, not the whole file: it does not become a broad refactor nor gets mixed with `feat`/`fix` in the same PR (surgical edit).

**Also banned:** TODO without a measurable condition (ok: `// TODO(2026-Q3): remove after the auth migration, issue #142`), comment left stale when editing adjacent code, multi-paragraph block inside a function (extract a function), commented-out code (git keeps it).

**JSDoc/TSDoc:** only on public API (export consumed outside the module/slice) AND when the signature does not cover the contract (idempotency, side effect, ordering, lock). Documents the contract, never the implementation. Text in pt-BR; tags/types in English. Paraphrasing the signature = AI comment, delete.

## Documentation

**A handbook (`docs/`, `CLAUDE.md`, `AGENTS.md`) is a manual: mechanism, command, the trap that bites.** Rationale, rejected alternatives and history only in the ADR (`docs/adr/README.md`: "Why" in at most 4 sentences) — the handbook links the ADR, never repeats it. Surgical edit: one edit grows at most 30 lines; a new handbook ≤ 80, a new ADR ≤ 60. No diagram in prose, no "Context"/"Alternatives" section. Longer text is the user's decision, never the agent's. Hook: `.claude/hooks/docs-stay-lean.mjs`.

## Language

- Identifiers vs. comments/docstrings/user-facing errors: see [`AGENTS.md`](../../../AGENTS.md) (Tripwires → Language).
- Stack technical terms (`stream`, `cache`, `webhook`, `payload`, `idempotente`, `outbox`): English.
- Internal logs: pt-BR with English stack terms (`unauthorized`, `forbidden`, `not found`, `timeout`).
- Never leak stack traces/SQL/internal paths in a user-facing message.

## Naming

Casing table by kind and file naming: back in `../backend-architecture/SKILL.md`, front in `../frontend-architecture/SKILL.md` (Postgres DB in `../backend-architecture/SKILL.md`). Cross-cutting:

- The name describes **what it is**, not how it works. `invoices` > `invoiceArray`.
- Booleans never negative (`is/has/can/should`): `isEnabled`, never `isNotDisabled`.
- Function = verb; class/type = noun.
- Abbreviations only when universal in the domain (`id`, `url`, `db`, `ctx`). No `usr`, `mgr`.
- Singular = entity; plural = collection.

## Functions

- Short. Warning sign at ~30 lines; hard gate at 50 (review fails).
- 1 responsibility; the name reflects that single thing.
- Early return; avoid deep nesting.
- Up to 3 positional parameters; more = `{ }` object.
- No boolean flag (`send(invoice, true)`) — split into two functions.
- Pure when possible. `domain/` is exclusively pure.

## TS typing

- Strict `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`. Applies to both apps, no exception — index access always yields `| undefined` and the missing case has to be handled.
- **`any` is forbidden** (ESLint error). `unknown` + narrowing.
- `unknown` at external boundaries (parse, IO); `never` in exhaustive checks.
- `type` by default; `interface` only for declaration merging.
- `as` only at a boundary or after narrowing. Never `as any` / `as unknown as X`.
- Discriminated unions to model state/shape, **never** error control flow (use throw).
- Inference for locals; annotate the return type of exported functions.
- Readonly on props, config, selector returns.
- Branded types for IDs and primitive VOs.

## Imports

- Order (groups separated by a blank line): Node builtins → external libs → aliases (`@/`) → relative → `import type` → side effects.
- `import type` for everything that is type-only.
- No `import *` except idiomatic namespaces (`import * as z from 'zod'`).
- No default export except lazy routes (TanStack/`React.lazy`) and plugin config.
- No circular imports (lint catches it).
- Subpath > barrel in packages (`@platform/api-client/hooks/*` | `zod/*` | `models/*`).

## Errors

- **Throw is the only error path.** Never `Result<T>`/`Either`.
- Throw `Error` or a subclass, never a bare string/object.
- Custom classes in `domain/` (`extends DomainError`); the global filter maps → RFC 7807.
- No swallowing. A `try/catch` that logs and continues needs a written reason (comment case 4).
- `unknown` in catch, always narrowing; re-throw what you did not handle.
- User-facing: pt-BR, no stack/SQL/path. `correlationId` in the envelope (RFC 7807 on the back).
- Logs: pass `{ err }`, never `err.message` (loses the stack).

## Async

- **No floating promises** (ESLint error). `await`, `.then()` or explicit `void`.
- `Promise.all` on independent calls; `await` in a loop only with a dependency.
- `AbortSignal` on fetch/long IO (event handler, job).
- No `async` without an `await` inside.
- No `new Promise((resolve, reject))` when a native async API exists.

## Lint / format

- Prettier = the single formatter, no style debate.
- ESLint: `typescript-eslint` strictTypeChecked + stylisticTypeChecked, `import-x` (order, no-cycle), `unused-imports`; front adds react/react-hooks/jsx-a11y.
- **Suppressing lint is forbidden** — no `eslint-disable` in any form, no turning a rule off in the file. Conflict with a mandatory framework pattern → escalate to the user, never suppress inline.
- CI blocks merge on lint/format/typecheck error.

## Tests

- Pyramid: unit (pure `domain/`) > integration (`application/` + real Postgres) > e2e.
- No database mock in integration/e2e — `testcontainers`.
- The test name describes behavior, not implementation.
- AAA: arrange, act, assert.
- No tests for trivial getters/setters.
- Coverage: `domain/` (entities + VOs) ≥ 80%. The rest = consequence, not target.
- Snapshots only for stable structure (OpenAPI, schema), never a React component.

## PR / scope

- Single declared scope: `feat:` / `fix:` / `refactor:` do not mix.
- Adjacent refactor only when it reduces the risk of the fix — justify it.
- Rename in a separate PR; move + rename = 2 commits.
- No mass reformatting (no "format only" PR).

## Code review checklist

CI covers lint, format, typecheck, `any`, `console.log`, floating promises, import order. Review focuses on the rest.

```
□ Comments only in the 4 cases; nothing descriptive; JSDoc only for a non-obvious contract
□ Function: 1 responsibility, no boolean flag, ≤50 lines
□ Error: DomainError subclass, throw is the only path (no Result<T>); no swallowing
□ Promise.all on parallelizable calls (await-in-loop only with a dependency)
□ Tests name behavior; no database mock in integration/e2e; domain/ ≥ 80%
□ Single-scope PR; no mass reformat; no eslint-disable
□ Language: see AGENTS.md (Tripwires → Language)
□ Follows the layer handbook (backend-architecture / frontend-architecture)
```
