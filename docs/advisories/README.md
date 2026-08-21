<!--
Canal de advisories da plataforma. Arquivos `ADV-YYYYMMDD-NN.md` desta pasta
são imutáveis no filho — nunca edite, apague ou mova; `copier update`
reescreve o conteúdo do template a cada release. Aplicou a correção?
Acrescente uma linha em `APPLIED.md`, nunca edite o advisory.
-->

# docs/advisories

Cada advisory é um arquivo `ADV-<YYYYMMDD>-<NN>.md` com frontmatter:

```yaml
id: ADV-20260901-01
kind: bug | security | breaking
module: <entry>/<variant>
affects: ">=1.0.0 <1.2.0" # semver range
severity: low | medium | high | critical
detect: "pnpm platform advisory detect ADV-20260901-01"
fix: "resumo + link para o changelog"
parity: "caminho/para/o.parity.spec.ts"
```

Corpo em pt-BR: contexto, impacto, passos.

- `pnpm platform advisory detect <id>` roda o `detect` do advisory (exit 1 =
  filho afetado).
- No início da sessão, `.claude/hooks/pending-advisories.mjs` computa quais
  advisories afetam os módulos instalados (`.platform-modules.lock`) e ainda
  não constam em `APPLIED.md`, e mostra um resumo.
- Correção em `catalog/**` sem advisory correspondente é barrada no commit
  (`scripts/platform/advisory-required.mjs`).
