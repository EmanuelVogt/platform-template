# Context — docs-audience-contract

Gray areas discussed with the owner at Specify, 2026-08-23. Four rulings, all given in one round.

## 1. Declaration mechanism — **directory**, not front matter

**Ruled:** template-only docs move under `docs/platform/`, excluded by the single anchor
`/docs/platform` (same shape as `/catalog` and `/docs/platform_template`).

**This reverses the lean the handoff carried.** The previous session recommended
`audience: platform | product | both` front matter on every `docs/**` file and recorded the owner's
`ok` without the option being named, so the row was re-opened here rather than treated as settled —
and the owner chose the other option. The front-matter case (it inverts today's default: a new doc
would not ship until it declares) was presented and lost to the cost: an annotation on 35 files plus
a per-file assertion, against one `_exclude` line.

**What the directory costs, accepted knowingly:** it does **not** invert the default — a new doc
still ships unless someone files it under `docs/platform/`. The mechanical catcher (ruling 3), not
the directory, is what closes the confirmed defect. Recorded in `spec.md` § Assumptions as an
unconfirmed-but-accepted trade-off so no later phase reads the directory as a stronger guarantee
than it is.

**The `both` gap:** a directory has no place for a doc both sides need. Resolved by ruling 2 — such a
doc is **split**, not marked.

## 2. A doc both sides need — **this feature repairs it**

**Ruled:** `docs/agents/workflow.md` is split — a shipped half addressed to the child, a
`docs/platform/` half holding the template mechanics (`release` dispatch, `.worktrees/`, the shared
main checkout, "no pull requests for our own work", the `origin/main` staleness anecdote).

Rejected: excluding the file wholesale (the child would lose its branch/commit/spec rules and
`docs/agents/README.md:14` would dangle), and deferring the repair behind a dated waiver list (it
would ship a gate whose declared hole is exactly the defect that started the feature).

## 3. Catcher enforcement point — **static, in `pnpm test:scripts`**

**Ruled:** derive the shipped set from `git ls-files` minus `copier.yml` `_exclude`; no copier
render, no docker. Runs on every pre-push.

Rejected: running it inside `pnpm template:smoke` against a real rendered child. That is more
faithful — it sees Jinja output and the `_skip_if_exists` pruning of `package.json` scripts — but it
only fires when someone calls `template:smoke`, so the defect walks past the gate that actually runs.
The fidelity loss is bounded: the shipped-set computation strips a trailing `.jinja`, which covers
the only rendered-name difference that affects paths.

## 4. Contract scope — **`docs/**` only**

**Ruled:** the contract covers the 35 files under `docs/`. `.claude/agents/**`, `AGENTS.md.jinja` and
`.github/README.md` are agent-read prose that also ships, and stay out — recorded in `spec.md`
§ Out of Scope, not dropped.

---

## Boundaries with features in flight

- **`audit-2026-08-23-remediation`** owns the `BRAND-*` class (vocabulary) and `RUN-01` AC 6
  (commands named in four pinned files). This feature owns the addressee and **paths**. The two
  never edit a line for the same reason; neither weakens the other.
- **`docs/platform_template/`** is cited by path from that feature's `research.md`/`spec.md` and from
  `prettier-format-gate/spec.md`. It keeps its own anchor; folding it into `docs/platform/` is a
  follow-up for after both close.
- **`v2.3.0` is untagged** and a parallel session owns its changelog section. This feature's section
  is authored at Tasks against the next unreleased version and never touches `v2.3.0`.
