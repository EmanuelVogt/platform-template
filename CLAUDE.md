# platform-template (repositório do template)

Você está no repositório do TEMPLATE, não num produto. Leia `TEMPLATE.md` e
`docs/dev/template.md`. As regras de código são as de `AGENTS.md.jinja` (idênticas ao
produto): `docs/code-quality.md`, `docs/back/back-arch.md`, `docs/front/front-arch.md`,
`docs/test/testing.md`, `docs/agents/*`.

O template distribui **só o kernel** — módulos são entradas versionadas em `catalog/`
(fora do copier), instaladas no produto via `pnpm platform module add`.

Regras específicas daqui:
- Nada de produto entra: sem domínio de negócio, marca, domínio DNS ou repositório real
  fora dos placeholders Jinja (`{{ project_name }}`, `{{ github_org }}`, `{{ root_domain }}`…).
- Só docs e manifests levam `.jinja`. Código-fonte lê configuração/env.
- Kernel nunca importa entrada do catálogo; entradas não se importam entre si fora de
  `dependsOn` (`module-boundaries.spec.ts`, RULE C).
- Correção em `catalog/**` sem advisory correspondente não é aceita (hook de commit-msg).
- Mudança que o produto deve receber = tag semver.
