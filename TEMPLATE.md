# platform-template

Template copier da plataforma: kernel + base-set da API NestJS, front React/Vite headless,
harness de agentes, handbooks, CI e Docker. Este arquivo e o `CLAUDE.md` existem só no
repositório do template (excluídos no `copier.yml`); o produto gerado recebe
`README.md` e `AGENTS.md`/`CLAUDE.md` próprios.

## Gerar um produto

```
pipx install copier              # ou uv tool install copier
copier copy gh:EmanuelVogt/platform-template ./meu-produto
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
