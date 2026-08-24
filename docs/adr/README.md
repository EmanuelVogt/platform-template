# ADRs — index

One record per decision, format `NNNN-title.md`. Line = ADR title.

## How to write an ADR

Four blocks, in this order, in the product's language (see [`AGENTS.md`](../../AGENTS.md),
Two standing rules). Ceiling: **~30 lines**; going beyond it requires that the
excess be decision, never narrative.

```markdown
# NNNN — Title

Status: Accepted (YYYY-MM-DD)

**Decision.** The points, numbered when there is more than one.

**Why.** The NON-obvious rationale, in up to 4 sentences: the trap, the trade-off, what
another dev would try and break.

**Consequences.** Only the non-obvious ones, as bullets. None? Omit the section.
```

**Left out**: the story of how the bug was discovered, a code walkthrough, a
second example, and the detail of a conformance spec that typecheck/lint/test already
guarantees (the conformance spec is worth half a line). The reader has the code at hand — the
ADR carries what the code does not tell.

**A superseded decision is never deleted.** Mark it `~~strikethrough~~` + **superseded/reverted**,
and add to `Status:` one line per revision pointing to the ADR that replaced it. A fully
superseded ADR stays in the index: it is the only explanation of what existed before.

**Before numbering, look at the disk** (`ls docs/adr`) — the next number is the highest + 1.
Parallel branches have already created a collision (two `0035-*`), which forces whoever cites
them to disambiguate by file name.

**Inherited references.** Other handbooks, hooks and code comments may cite ADRs by number
(`ADR 0089` etc.) — they are decisions of the template's origin project and do not travel
with it. The cited rule remains valid where it is written; the origin ADR is only the
history. This index starts empty: the first ADR of this product is `0001`.
