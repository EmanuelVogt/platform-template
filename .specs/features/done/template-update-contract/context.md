# template-update-contract — context (user decisions)

Captured 2026-08-23 during Specify, one round. The user's words were pt-BR; recorded in English.

| # | Gray area | Decision | Rationale given / implied |
| --- | --- | --- | --- |
| 1 | Scope split | **All in one feature** — template side (release gate, semver/migration contract, kernel advisories, entry-change guard), child side (remote feed in the hook/status, measured cadence) **and** the weekly update workflow in the child. | The user wants the standard fixed end to end in one cycle; the orchestrator cuts waves, not scope. |
| 2 | How a `v*` tag is guaranteed gate-green | **Release workflow** (`workflow_dispatch` by the user) runs the gates on the commit and only then creates and pushes the annotated tag. A hand-made tag stays possible but is outside the standard. | Keeps "tag is the user's act" (`docs/agents/workflow.md`) while making the gate structural — `v2.0.0` was cut without `catalog:check`. |
| 3 | Update cadence | **Recommended and measured**, never enforced: the standard states the cadence per advisory kind; hook and `status` show how far behind and for how long. Nothing blocks a session. | One operator on both sides today; a blocking hook would be worked around. |
| 4 | Remote feed for kernel advisories | **Git sparse checkout of the latest stable tag** (`docs/advisories/`), cached 24 h next to the tags cache, same mechanism as `catalog-source.mjs`. No published JSON, no GitHub Release asset. | Zero new infrastructure; the hook already talks to the remote with `git ls-remote`. |

Origin of the feature: issue #9 (catalog entries uninstallable on `v2.0.0`) and the `.copier-answers.yml` fixture leak (v1.0.0–v2.1.0) — two kernel/tooling defects that the advisory ledger cannot express (it only matches installed catalog entries) and that the child only learns about after updating.
