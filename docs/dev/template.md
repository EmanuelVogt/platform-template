# Template de plataforma — origem, fronteira e atualização

Este repositório nasceu do `platform-template` via [copier](https://copier.readthedocs.io).
O arquivo `.copier-answers.yml` na raiz guarda as respostas e a versão do template
(`_commit`) — é ele que permite receber atualizações da plataforma sem histórico git
compartilhado. Nunca edite esse arquivo à mão.

## O que é kernel, o que é catálogo, o que é produto

| Camada                                                                                   | Dono                                       | Onde                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Kernel da API (transação, outbox, ALS ator, tracing, idempotência, listagem, health, storage, guard de acesso) | plataforma                    | `apps/api/src/shared/**`                                                   |
| Catálogo de módulos (entradas versionadas, fora do copier)                                | plataforma                                  | `catalog/<entry>[/<variant>]/`                                             |
| Composition root                                                                          | **produto** (recebe as entradas instaladas) | `apps/api/src/app.module.ts`, `apps/api/src/platform-modules.ts` (gerado), `apps/api/src/db/schema.ts` |
| Entrada do catálogo instalada                                                             | produto (copiada; dono a partir do `module add`) | `apps/api/src/modules/<entry>`                                        |
| Módulos de negócio                                                                        | produto                                     | `apps/api/src/modules/<seu-modulo>`                                       |
| Migrations do kernel                                                                      | plataforma                                  | `apps/api/drizzle/migrations/0000_*`, `0001_*`                            |
| Migrations de entrada                                                                     | geradas no produto pelo `module add`        | `apps/api/drizzle/migrations` (gerado)                                    |
| Migrations de negócio                                                                     | produto                                     | `apps/api/drizzle/migrations` a partir de `1000_`                         |
| Contrato HTTP e cliente gerado                                                            | plataforma (mecanismo) / produto (rotas)    | `openapi.json`, `packages/api-client`                                     |
| Front headless (transporte, CSRF, guard de acesso, layout sem estilo)                     | plataforma                                  | `apps/web/src/app/**`, `shared/{config,store,lib,test}`                   |
| Parte web de uma entrada instalada                                                        | produto (copiada)                           | `apps/web/src/entities/<entry>/{core,react}`                              |
| Rotas e telas do produto, kit de UI                                                       | produto                                     | `apps/web/src/app/router/product-routes.tsx` e tudo que ele importa       |
| Harness de agentes (hooks, agentes, skills, `AGENTS.md`), handbooks, CI, Docker, deploy    | plataforma                                  | `.claude/`, `.agents/`, `docs/`, `.github/`, `apps/*/Dockerfile`          |
| ADRs, specs, README                                                                       | produto                                     | `docs/adr/`, `.specs/`, `README.md`                                       |

Regra que mantém o `copier update` sem conflito: **produto adiciona arquivos; não edita
arquivos da plataforma**. Onde a plataforma precisa ser estendida, ela expõe uma entrada do
catálogo (`pnpm platform module add`) ou uma porta do kernel (interface declarada ao lado do
conceito, em `shared/kernel/`) — nunca um ponto de edição. Se você se pegar editando um
arquivo do kernel, a mudança provavelmente pertence ao template (abra PR lá) ou falta uma
porta.

## Receber atualização da plataforma

```
uv tool install copier        # ou pipx install copier — uma vez por máquina
git status                    # working tree limpo é obrigatório
copier update                 # aplica o diff template@_commit → template@latest com merge de 3 vias
```

Conflitos aparecem como marcadores `<<<<<<<` normais; resolva, rode `pnpm check` e os
testes, e commite. Para pular para uma versão específica: `copier update --vcs-ref vX.Y.Z`.
Para ver o que mudaria sem tocar no disco: `copier update --pretend --diff`.

## Catálogo de módulos

Módulos de plataforma não vêm mais copiados pelo copier — vivem como entradas versionadas
em `catalog/<entry>[/<variant>]/`, excluídas do template renderizado. Estrutura de uma
entrada, README, versionamento e a regra raw-web estão em
[`docs/catalog/catalog.md`](../catalog/catalog.md); aqui vai só o que o produto usa no
dia a dia.

### Comandos (`pnpm platform <cmd>`)

| Comando                                                                          | O que faz                                                                                                             |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `module add <entry> [--variant v] [--with-deps] [--dry-run] [--force] [--rollback]` | copia a entrada para dentro do produto, gera as migrations, roda `pnpm contract` e os testes da entrada; grava `.platform-modules.lock` |
| `module adopt <entry> [--variant v] [--version x.y.z]`                            | registra no lock uma entrada que o produto já tinha antes de existir o catálogo (migração de v0.2) — sem copiar arquivo |
| `module list`                                                                     | compara a versão do lock com a HEAD do catálogo                                                                       |
| `module update <entry>`                                                          | não copia nada — imprime as instruções da skill `port-module-update` (o porte é tarefa de agente, não de script)      |

`module add` também apaga os arquivos só-do-template (`TEMPLATE_ONLY_FILES` em `apply.mjs`) —
guards que valem só sem entrada instalada, como `template-kernel-only.spec.ts` (KRN-01) e o
contrato OpenAPI (`apps/api/test/openapi-contract.e2e-spec.ts` + snapshot).

### `.platform-modules.lock`

Gerado por `module add`/`module adopt`, na raiz do produto — nunca editado à mão: fonte do
catálogo (`catalog.source`/`ref`) e, por entrada, variante, versão, data de instalação,
arquivos copiados (com hash) e migrations geradas. É a partir dele que
`apps/api/src/platform-modules.ts` e `apps/api/src/db/platform-schema.ts` são gerados —
também nunca editados à mão (o cabeçalho de cada um avisa).

### Advisories

Uma correção retroativa numa entrada nasce como `docs/advisories/ADV-YYYYMMDD-NN.md` no
repositório do template (frontmatter com id, tipo, entrada afetada, faixa de versão,
severidade e comando de detecção, além da referência ao `CHANGELOG.md` da entrada). O
produto recebe o arquivo por `copier update`; um hook do início da sessão cruza o lock
contra a faixa de versão afetada e avisa quais advisories ainda não foram aplicadas —
ledger em `docs/advisories/APPLIED.md`, também nunca reescrito à mão. Regra do repositório
do template: **correção em `catalog/**` sem advisory correspondente não é aceita** (hook de
commit-msg da plataforma).

### Portar uma atualização de entrada

`module update` sempre recusa copiar; siga a skill `port-module-update`: ela lê o lock,
resolve o diff da entrada entre a versão instalada e a HEAD do catálogo, aplica sozinha todo
arquivo que o produto não tocou desde a instalação, e para nos que o produto já modificou —
aí o porte é manual.

### Gate antes de cortar uma tag de entrada

`pnpm catalog:check [entrada…]`, no repositório do template (o produto não recebe o
comando), renderiza um produto kernel-only num diretório descartável,
instala cada entrada em ordem topológica e roda os testes; é o gate de pré-tag do catálogo
(minutos — não é hook de commit).

### Receita: `/docs` protegido por login

O template monta `GET /docs` sem autenticação e sem depender de módulo nenhum. Um produto
que precisa do login de volta:

1. Instala a entrada que traz autenticação (`pnpm platform module add <entrada-com-auth>`).
2. Substitui a montagem atual de `/docs` por uma versão que aplica o guard/middleware de
   autenticação da entrada antes de servir a documentação — reusa o mecanismo de sessão já
   existente na entrada, não invente um novo.
3. Cobre o comportamento com um e2e próprio do produto — o template não traz mais um teste
   de `/docs` autenticado.

## Migrations (AD-015)

- Kernel: `apps/api/drizzle/migrations/0000_kernel_baseline.sql` (+ snapshot) e
  `0001_kernel_outbox_notify.sql`; numeração `NNNN_kernel_<slug>` segue a partir daí.
- Entradas do catálogo nunca trazem SQL numerado de tabela: tabelas vêm como TS
  (`infrastructure/tables/**`) e passos manuais (trigger, função) em
  `migrations/custom/NN_<slug>.sql`; o produto gera a migration de verdade no
  `module add` (`drizzle-kit generate` + `--custom` por arquivo manual) — numeração,
  `when` e cadeia de snapshot são do produto.
- Migration de negócio do produto continua com prefixo `1000_`.
- Journal único (`apps/api/drizzle/migrations/meta/_journal.json`) — depois de um
  `copier update` que traz `0000`/`0001` novos do kernel, se
  `pnpm --filter api db:check:journal` reprovar porque uma entrada da plataforma "nasceu
  no passado" do journal do produto, reestampe o `when` das entradas recebidas para um
  valor maior que o da última migration já aplicada no produto, preservando a ordem entre
  elas.

## Devolver uma melhoria para a plataforma

Correção genérica (kernel, harness, docs, infra) nasce aqui? Reproduza no repositório do
template como PR, publique uma tag, e traga de volta com `copier update`. Não mantenha o
fix só localmente: no próximo update ele vira conflito.
