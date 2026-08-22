# Catálogo de módulos

O template distribui apenas o kernel; os módulos que antes formavam o base-set (identity,
attachment, audit, notification, tag, …) vivem como **entradas do catálogo** em `catalog/`,
fora do copier. Um app filho adiciona uma entrada com `pnpm platform module add <name>
[--variant]`, que copia o código para dentro do filho e registra a versão em
`.platform-modules.lock`. Uma entrada por módulo; variantes (ex.: `single-tenant`,
`multi-tenant`) são sub-entradas; não há bundles — composição vem de `dependsOn`.

## Modelo de uma entrada

```
catalog/
  README.md                       # índice: entradas, versões, como adicionar/autorar
  schema/module.schema.json       # schema JSON de module.json
  identity/single-tenant/
    module.json  README.md  CHANGELOG.md
    api/         # espelha apps/api/src/modules/identity/** (código + *.spec.ts + *.int-spec.ts + *.e2e-spec.ts)
    web/core/  web/react/
    migrations/custom/NN_<slug>.sql   # apenas passos SQL manuais (triggers, funções); tabelas vêm de api/**/tables
    parity/      # *.parity.spec.ts (copiados ao lado do módulo, rodam via `pnpm vitest run --project api <path>` no filho) + contract.snapshot.json
```

`module.json` é validado por `catalog/schema/module.schema.json` e segue convenção sobre
configuração: `api/**` mapeia para `apps/api/src/modules/<name>/**`; `web/core|react` mapeia
para `<webRoot>/core|react`; `parity/*.parity.spec.ts` mapeia para
`apps/api/src/modules/<name>/__parity__/`, junto com `parity/contract.snapshot.json`. Só os
campos descritos no schema são explícitos — o resto é convenção de path.

Cada entrada versiona via `module.json.version` e ganha uma tag `catalog/<name>[-<variant>]@x.y.z`
no repositório do template quando uma versão é cortada (AD-016). O `CHANGELOG.md` segue
keep-a-changelog; todo título de versão que carrega código também lista os ids de advisory
que ela carrega.

## Autoria de uma entrada

1. Código em `api/**` espelha a estrutura de `apps/api/src/modules/<name>/**`, incluindo os
   próprios testes (`*.spec.ts`, `*.int-spec.ts`, `*.e2e-spec.ts`).
2. Parte web, se houver, é `web/core` (TS puro) e `web/react` (hooks/opções de react-query) —
   ver a regra raw-web abaixo.
3. Migrações manuais (triggers, funções — nunca criação de tabela) ficam em
   `migrations/custom/NN_<slug>.sql`; o app filho gera as migrações reais com
   `drizzle-kit generate` no momento do `module add`, então numeração, `when` e a cadeia de
   snapshots são do filho.
4. `README.md` segue o contrato fixo de seções descrito em
   [`README-contract.md`](./README-contract.md).
5. `CHANGELOG.md` segue keep-a-changelog e cita advisories carregadas por versão.
6. Testes de paridade em `parity/*.parity.spec.ts` comparam o comportamento da entrada contra
   `parity/contract.snapshot.json`.

## Regra raw-web

Para manter as entradas portáveis entre apps filhos com stacks web diferentes (Vite, Next…):

- **`web/core/**`**: apenas TypeScript puro. Imports permitidos: `zod`, `@platform/api-client`,
  imports relativos. Nenhum componente, página ou roteador.
- **`web/react/**`**: além dos imports de `web/core`, também `react` e
  `@tanstack/react-query`. Só hooks e opções de react-query — nunca componentes, páginas ou
  roteadores.
- **Exceção nos arquivos de teste** (`*.test.ts(x)`): `web/core` soma `vitest`; `web/react`
  soma `vitest` + `@testing-library/react` (para `renderHook`) — o resto da lista continua
  proibido mesmo em teste.
- Qualquer outro import (`@tanstack/react-router`, `next/*`, bibliotecas de componentes) falha
  no `catalog-lint`. Integração de UI/roteador é responsabilidade do app filho, documentada
  como receita na seção `## Parte web` do README da entrada.
- O cliente HTTP gerado nunca é versionado na entrada; `module add` roda `pnpm contract` no
  filho para gerá-lo.
- `--web-root` por padrão é `apps/web/src/entities/<module>/` (então `core/` vira
  `entities/<module>/core/` e `react/` vira `entities/<module>/react/`); filhos Next passam a
  própria raiz `src/`.

## Lint e checks

- **`pnpm catalog:lint`** (`scripts/platform/catalog-lint.mjs`), acionado pelo hook lefthook
  **pre-commit** de `lefthook-local.yml` em `catalog/**` e `docs/advisories/**`, valida: `module.json` contra o schema;
  presença e ordem das seções do README conforme `README-contract.md`; allow-list de imports em
  `web/**`; existência de um título de versão no `CHANGELOG.md` correspondente a
  `module.json.version`; e o frontmatter das advisories.
- **Regra advisory-required** (`scripts/platform/advisory-required.mjs`): se algum path está sob
  `catalog/<entry>/(api|web|migrations|parity)/**`, precisa existir um
  `docs/advisories/ADV-*.md` com `module: <entry>` no mesmo commit, ou a mensagem desse commit
  precisa carregar o trailer `Advisory: none — <motivo>`; caso contrário falha (exit 1) com a
  regra impressa. Dois acionadores, um só módulo: o hook lefthook **commit-msg** de
  `lefthook-local.yml` (commit local, arquivos staged) e o job `gates` de
  `.github/workflows/catalog.yml`, que chama
  `--range <base>..<head>` e julga **cada commit do PR pela própria mensagem** — um trailer no
  último commit não isenta os anteriores.
- **`pnpm catalog:check [entry…]`** (`scripts/platform/catalog-check.mjs`) não é hook de git
  (leva minutos): renderiza um filho kernel-only via copier num diretório de scratch, roda
  `pnpm install`, e para cada entrada em ordem topológica faz `module add` cumulativo + testes
  escopados; ao final roda `pnpm check && pnpm test` mais paridade. É o **gate pré-tag**,
  documentado aqui e acionado manualmente ou em CI antes de cortar uma tag de entrada.

## Advisories

Correções, falhas de segurança e mudanças quebradoras em uma entrada já tagueada são
documentadas como advisories em `docs/advisories/ADV-YYYYMMDD-NN.md`, com frontmatter
`id, kind (bug|security|breaking), module, affects (faixa semver na versão da entrada),
severity, detect, fix, parity`. O corpo, em pt-BR, descreve contexto, impacto e passos. Uma vez
tagueado, o arquivo é imutável — o app filho nunca apaga ou move advisories. O filho mantém um
ledger em `docs/advisories/APPLIED.md` (`- ADV-… — YYYY-MM-DD — <commit>`), listado em
`_skip_if_exists` no `copier.yml`. O hook `.claude/hooks/pending-advisories.mjs` imprime a
diferença entre advisories e ledger, filtrada pelas versões travadas no lockfile.

Ver detalhes completos do fluxo de advisories em [`../advisories/`](../advisories/).
