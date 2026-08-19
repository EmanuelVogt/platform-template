# Template de plataforma — origem, fronteira e atualização

Este repositório nasceu do `platform-template` via [copier](https://copier.readthedocs.io).
O arquivo `.copier-answers.yml` na raiz guarda as respostas e a versão do template
(`_commit`) — é ele que permite receber atualizações da plataforma sem histórico git
compartilhado. Nunca edite esse arquivo à mão.

## O que é plataforma e o que é produto

| Camada                                                                                                | Dono                                      | Onde                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Kernel da API (transação, outbox, ALS, tracing, idempotência, listagem, health, storage, audit trail) | plataforma                                | `apps/api/src/shared/**`                                                                      |
| Base-set de módulos (identity, audit, attachment, tag, notification)                                  | plataforma                                | `apps/api/src/modules/{identity,audit,attachment,tag,notification}`                           |
| Composition root                                                                                      | **produto** (recebe seus módulos)         | `apps/api/src/app.module.ts`, `apps/api/src/db/schema.ts`                                     |
| Módulos de negócio                                                                                    | produto                                   | `apps/api/src/modules/<seu-modulo>`                                                           |
| Migrations                                                                                            | plataforma até o baseline; produto depois | `apps/api/drizzle/migrations`                                                                 |
| Contrato HTTP e cliente gerado                                                                        | plataforma (mecanismo) / produto (rotas)  | `openapi.json`, `packages/api-client`                                                         |
| Front headless (transporte, CSRF, sessão, guard, login sem estilo)                                    | plataforma                                | `apps/web/src/app/**`, `entities/session`, `features/login`, `shared/{config,store,lib,test}` |
| Rotas e telas do produto, kit de UI                                                                   | produto                                   | `apps/web/src/app/router/product-routes.tsx` e tudo que ele importa                           |
| Harness de agentes (hooks, agentes, skills, `AGENTS.md`), handbooks, CI, Docker, deploy               | plataforma                                | `.claude/`, `.agents/`, `docs/`, `.github/`, `apps/*/Dockerfile`                              |
| ADRs, specs, README                                                                                   | produto                                   | `docs/adr/`, `.specs/`, `README.md`                                                           |

Regra que mantém o `copier update` sem conflito: **produto adiciona arquivos; não edita
arquivos da plataforma**. Onde a plataforma precisa ser estendida, ela expõe um slot
(`IdentityModule.forRoot({ professional })`), um registro (`productRoutes`) ou uma
porta — nunca um ponto de edição. Se você se pegar editando um arquivo do kernel, a
mudança provavelmente pertence ao template (abra PR lá) ou falta um slot.

## Receber atualização da plataforma

```
uv tool install copier        # ou pipx install copier — uma vez por máquina
git status                    # working tree limpo é obrigatório
copier update                 # aplica o diff template@_commit → template@latest com merge de 3 vias
```

Conflitos aparecem como marcadores `<<<<<<<` normais; resolva, rode `pnpm check` e os
testes, e commite. Para pular para uma versão específica: `copier update --vcs-ref vX.Y.Z`.
Para ver o que mudaria sem tocar no disco: `copier update --pretend --diff`.

## Slots e registries

Onde o produto estende a plataforma sem editar arquivo dela — "slot" é um array estático
(o contrato precisa do valor literal no import); "registry" é um serviço injetável que o
produto alimenta no boot (`OnModuleInit`). Mecanismo completo: AD-001.

| Slot                   | Arquivo (plataforma)                                  | Mecanismo                                                                                            | Como o produto estende                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfis de acesso       | `shared/kernel/access/product-access-profiles.ts`     | array estático — o `z.enum` do contrato é avaliado no import, não pode vir de um registry em runtime | acrescenta um `AccessProfileDef` a `PRODUCT_ACCESS_PROFILES`; propaga para `ACCESS_PROFILES`, `AccessProfile`, `ASSIGNABLE_ACCESS_PROFILES` e o `pgEnum` sem tocar outro arquivo |
| Catálogos de permissão | `shared/kernel/access/product-permission-catalogs.ts` | array estático                                                                                       | acrescenta seu `ModuleDef` a `PRODUCT_PERMISSION_CATALOGS` + `declare module` estendendo `PermissionKeyRegistry` com as chaves do próprio módulo                                 |

Migration do produto para o próprio perfil de acesso (a plataforma não migra dado nenhum):

```sql
ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS '<key>';
```

**Cuidado (Postgres ≥ 12):** um valor de enum adicionado dentro da transação de uma
migration não pode ser usado por DML na mesma batch dessa migration — inserir/atualizar
uma linha com o valor recém-criado na mesma migration falha. Separe em duas migrations,
ou rode o `ADD VALUE` fora de uma transação, se precisar popular dado com o valor novo.

## Devolver uma melhoria para a plataforma

Correção genérica (kernel, harness, docs, infra) nasce aqui? Reproduza no repositório do
template como PR, publique uma tag, e traga de volta com `copier update`. Não mantenha o
fix só localmente: no próximo update ele vira conflito.
