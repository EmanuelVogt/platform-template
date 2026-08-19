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

| Slot                               | Arquivo (plataforma)                                                                                       | Mecanismo                                                                                            | Como o produto estende                                                                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfis de acesso                   | `shared/kernel/access/product-access-profiles.ts`                                                          | array estático — o `z.enum` do contrato é avaliado no import, não pode vir de um registry em runtime | acrescenta um `AccessProfileDef` a `PRODUCT_ACCESS_PROFILES`; propaga para `ACCESS_PROFILES`, `AccessProfile`, `ASSIGNABLE_ACCESS_PROFILES` e o `pgEnum` sem tocar outro arquivo                                                          |
| Catálogos de permissão             | `shared/kernel/access/product-permission-catalogs.ts`                                                      | array estático                                                                                       | declara o `ModuleDef` do produto no próprio slot (o kernel nunca importa `modules/`), acrescenta-o a `PRODUCT_PERMISSION_CATALOGS` + `declare module` estendendo `PermissionKeyRegistry` com as chaves do próprio módulo                  |
| Perfis de upload                   | `shared/kernel/upload/product-upload-profiles.ts`                                                          | array estático — mesmo motivo dos perfis de acesso                                                   | acrescenta um `UploadProfileDef` a `PRODUCT_UPLOAD_PROFILES`; propaga para `buildUploadProfiles`, `UploadProfileName` e, se `uploadRoute: true`, o enum da rota de upload                                                                 |
| Fontes de template de notificação  | `modules/notification/api/facades/notification-templates.facade.ts` (`NotificationTemplateSourceRegistry`) | registry runtime `@Injectable`                                                                       | módulo produto injeta o registry e chama `register({ type, catalog, email? })` no próprio `OnModuleInit`; `declare module` estende `NotificationTypeRegistry` com o novo `type`; `email` é opcional (tipo system-only não dispara e-mail) |
| Trilha de auditoria                | `modules/audit/api/facades/audit-registry.facade.ts` (`AuditRegistry`)                                     | registry runtime `@Injectable`, exportado por `AuditModule`                                          | módulo produto injeta `AuditRegistry` e chama `registerTables(...)`/`registerRefTargets(...)` no próprio `OnModuleInit`; chave duplicada lança `DuplicateAuditRegistrationError`                                                          |
| Rotas do produto                   | `apps/web/src/app/router/product-routes.tsx`                                                               | array estático (`AnyRoute[]`)                                                                        | produto exporta suas rotas em `productRoutes`; o `router.tsx` da plataforma as inclui via spread, sem editar o arquivo do router                                                                                                          |
| Fatia "professional" da identidade | `identity/identity.module.ts` (`IdentityModule.forRoot`)                                                   | slot de composition root (`DynamicModule`)                                                           | produto passa `{ module, scope, commitments }` em `IdentityModule.forRoot({ professional })` no `app.module.ts`; sem o slot, o kernel usa objetos nulos (comportamento hoje, AD-002)                                                      |
| Agregador de tabelas Drizzle       | `apps/api/src/db/schema.ts`                                                                                | agregador manual (`export *` linear)                                                                 | produto acrescenta `export * from "../modules/<produto>/infrastructure/tables/<x>.table"`; tabela ausente ali reprova `schema-completeness.spec.ts`                                                                                       |
| Composition root                   | `apps/api/src/app.module.ts`                                                                               | lista de módulos do Nest (`imports`)                                                                 | produto acrescenta seu `<Produto>Module` depois do base-set, sem editar nenhum módulo de plataforma                                                                                                                                       |

Migration do produto para o próprio perfil de acesso (a plataforma não migra dado nenhum):

```sql
ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS '<key>';
```

**Cuidado (Postgres ≥ 12):** um valor de enum adicionado dentro da transação de uma
migration não pode ser usado por DML na mesma batch dessa migration — inserir/atualizar
uma linha com o valor recém-criado na mesma migration falha. Separe em duas migrations,
ou rode o `ADD VALUE` fora de uma transação, se precisar popular dado com o valor novo.

### Numeração de migrations

A plataforma segue `NNNN_<module>_<slug>.sql` a partir de `0004` (`0000`–`0003` é o
baseline, nunca reescrito); produto começa em `1000_`. Journal único
(`apps/api/drizzle/migrations/meta/_journal.json`) — depois de um `copier update`, se
`pnpm --filter api db:check:journal` reprovar porque uma entrada da plataforma "nasceu
no passado" do journal do filho, reestampe o `when` das entradas recebidas para um valor
maior que o da última migration já aplicada no filho, preservando a ordem entre elas.

## Devolver uma melhoria para a plataforma

Correção genérica (kernel, harness, docs, infra) nasce aqui? Reproduza no repositório do
template como PR, publique uma tag, e traga de volta com `copier update`. Não mantenha o
fix só localmente: no próximo update ele vira conflito.
