# Agent docs

Files an **agent** reads to operate this repo — harness mechanics, git workflow, how to
talk to the user, infra access, issue tracker. They are written in
**English**: only agents load them, and English costs fewer tokens on every context
reload.

Everything else under `docs/` is a **human** handbook — `code-quality.md`, `arch/`, `test/`,
`dev/`, `docs/catalog/`, `adr/`. All docs are English; replies to the user follow
[`communication.md`](communication.md).

| File                                   | When to read it                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| [`workflow.md`](workflow.md)           | Creating a branch, sizing a task, opening a worktree, committing, writing a spec  |
| [`harness.md`](harness.md)             | Shell output looks wrong, installing/removing a skill, editing a hook             |
| [`communication.md`](communication.md) | Writing any reply to the user                                                     |
| [`infra.md`](infra.md)                 | Operating a deployed environment or its database, or a product's own provider access |
| [`issue-tracker.md`](issue-tracker.md) | Reading, creating or triaging a GitHub issue                                      |

Product strings quoted from the UI (screen labels, error messages) stay in pt-BR inside
the English text.
