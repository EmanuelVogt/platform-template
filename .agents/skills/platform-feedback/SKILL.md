---
name: platform-feedback
description: Guided flow to report a platform defect or improvement found in a generated product upstream to the template repository — draft, validate scope (platform-owned paths only), scan for secrets, stamp versions, and hand the user a ready `gh issue create` command / prefilled issue URL. Use when a bug or improvement belongs to the kernel, harness, platform docs, CI/Docker, or an installed catalog entry — never for the product's own business code. Opening the issue is always the user's act.
---

# Platform Feedback

The product was generated from `platform-template`. A defect or improvement in
**platform-owned** code (ownership table in `docs/dev/template.md`) is fixed once
upstream and reaches every product via `copier update` — so it is worth reporting.
This flow prepares that report; **it never sends anything by itself**.

## When this triggers — and when it must not

- Trigger: while working on any task you find a bug or a clear improvement in
  platform-owned paths (kernel `apps/api/src/shared/**`, web kernel
  `apps/web/src/{app,shared}/**`, harness `.claude/`/`.agents/`, platform docs, CI,
  Docker, `scripts/`, or an installed catalog entry from `.platform-modules.lock`).
- Finish the user's current task first; the report is a follow-up, never a detour.
- NOT for the product's own business code — that goes to the product's tracker
  (`docs/agents/issue-tracker.md`).
- NOT for something a pending advisory already covers (`pnpm platform status`) or a
  newer template tag already fixes (the template-behind hook / `status` output).

## The flow

1. Tell the user what you found, in one short paragraph (pt-BR): what, where, and why
   it belongs upstream. **Reporting is the user's decision** — offer, don't assume.
2. With the user's OK, write the draft at `.platform-feedback/<slug>.md` (gitignored),
   in English (the upstream repo's language), format below.
3. Run `pnpm platform feedback .platform-feedback/<slug>.md`. It validates the scope
   (platform-owned paths only), scans for secrets, stamps the installed template and
   module versions, writes the final body to `<slug>.issue.md`, and prints a
   `gh issue create` command plus a prefilled browser URL.
4. Show the user the final body and both options. Run the `gh` command only after the
   user approves that exact content; if `gh` is not authenticated, hand them the URL.
5. Optional, with the user's OK: check for duplicates first —
   `gh issue list --repo <owner/repo> --search "<keywords>"`.

## Draft format

```markdown
---
title: <one line, <=120 chars>
type: bug | improvement
area: kernel-api | kernel-web | harness | docs | ci-infra | catalog/<entry>
paths:
  - apps/api/src/shared/<...>
---

## What

## Evidence

## Suggested fix
```

Evidence rules: platform code only, snippets <= 20 lines, never the product's business
code, env values, secrets, or real user data. The validator blocks the obvious leaks
(product paths, credential patterns); it does not replace your judgment about what the
snippet reveals.

## Hard rules

- Nothing is sent without the user's explicit approval of the exact final body.
- A blocked path means the finding is product-owned — re-scope it or take it to the
  product's own tracker; never work around the validator.
- One finding per issue; a second finding is a second draft.
