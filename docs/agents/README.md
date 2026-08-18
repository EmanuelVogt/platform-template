# Agent docs

Files an **agent** reads to operate this repo — harness mechanics, git workflow, how to
talk to the user, infra access, issue tracker, domain glossary. They are written in
**English**: only agents load them, and English costs fewer tokens on every context
reload.

Everything else under `docs/` is a **human** handbook and stays in **pt-BR** —
`code-quality.md`, `back/`, `front/`, `design-system/`, `test/`, `dev/`,
`legacy_migration/`, `adr/`. Don't translate those.

| File | When to read it |
| --- | --- |
| [`workflow.md`](workflow.md) | Creating a branch, sizing a task, opening a worktree, committing, writing a spec |
| [`harness.md`](harness.md) | Shell output looks wrong, installing/removing a skill, editing a hook |
| [`communication.md`](communication.md) | Writing any reply to the user |
| [`infra.md`](infra.md) | Touching AWS, Dokploy, Cloudflare, Resend, or a long-lived environment's database |
| [`issue-tracker.md`](issue-tracker.md) | Reading, creating or triaging a GitHub issue |
| [`domain.md`](domain.md) | Exploring the code and needing the project's vocabulary |

Product strings quoted from the UI (screen labels, error messages) stay in pt-BR inside
the English text.
