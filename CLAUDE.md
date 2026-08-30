# platform-template (template repository)

You are in the TEMPLATE repository, not in a product. Read `TEMPLATE.md` and
`docs/dev/template.md`. The code rules are those of `AGENTS.md.jinja` (identical to the
product's): `.agents/skills/code-quality/SKILL.md`, `.agents/skills/backend-architecture/SKILL.md`,
`.agents/skills/frontend-architecture/SKILL.md`, `.agents/skills/testing/SKILL.md`,
`.agents/skills/{dev-workflow,communication,agent-harness}/SKILL.md`,
`.agents/skills/{infra,issue-tracker}/SKILL.md.jinja`.

The template ships **only the kernel** — modules are versioned entries in `catalog/`
(outside the copier), installed into the product via `pnpm platform module add`.

Rules specific to this repository:

- Nothing product-specific enters: no business domain, brand, DNS domain or real repository
  outside the Jinja placeholders (`{{ project_name }}`, `{{ github_org }}`, `{{ root_domain }}`…).
- Only docs and manifests carry `.jinja`. Source code reads configuration/env.
- The kernel never imports a catalog entry; entries never import each other outside
  `dependsOn` (`module-boundaries.spec.ts`, RULE C).
- A fix in `catalog/**` without a matching advisory is not accepted (commit-msg hook).
- A change the product should receive = semver tag.
