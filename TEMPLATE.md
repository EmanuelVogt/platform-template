# platform-template

Template copier da plataforma: **só o kernel** da API NestJS (sem módulo nenhum) + front
React/Vite headless, harness de agentes, handbooks, CI e Docker. Módulos de plataforma
vivem fora do copier, como entradas versionadas em `catalog/`, e entram no produto via
`pnpm platform module add` (ver [`docs/dev/template.md`](docs/dev/template.md)). Correção
numa entrada do catálogo sem advisory correspondente (`docs/advisories/ADV-*.md` ou o
trailer `Advisory: none — <motivo>` no commit) não é aceita. Este arquivo e o `CLAUDE.md`
existem só no repositório do template (excluídos no `copier.yml`); o produto gerado recebe
`README.md` e `AGENTS.md`/`CLAUDE.md` próprios.

## Gerar um produto

```
pipx install copier              # ou uv tool install copier
copier copy --trust gh:EmanuelVogt/platform-template ./meu-produto
```

## Publicar uma versão

Toda mudança que os produtos devem receber vira tag semver: `git tag v1.2.0 && git push --tags`.
O produto atualiza com `copier update` (ver `docs/dev/template.md`).

## Testar o template

```
copier copy --defaults --data project_name=Demo --data github_org=acme . /tmp/demo
cd /tmp/demo && pnpm check && pnpm test
```

Arquivos `.jinja` são renderizados; os demais copiados literalmente. Mantenha o Jinja
restrito a docs e manifests — código-fonte não leva placeholder (usa config/env).
