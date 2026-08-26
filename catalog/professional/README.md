# Catálogo — `professional`

Recorte profissional/agenda extraído da entrada `identity` no corte do agregado (AD-035):
perfil profissional 1:1 com o usuário, vínculos de área e de atuação, áreas de agendamento,
configuração de horários por usuário e o template padrão de horários. Publicada em
`apps/api/src/modules/professional/**` quando um app filho roda
`pnpm platform module add professional`.

É uma **entrada nova**, não uma variante do `identity` (AD-013): uma variante seria uma
implementação alternativa do mesmo módulo, e esta é um complemento que se instala ao lado.

## Contrato

| Método | Path | operationId | Eventos | Use case / facade |
| ------ | ---- | ----------- | ------- | ----------------- |
| —      | —    | —           | —       | —                 |

A entrada não publica rota HTTP própria: sua superfície é in-process, consumida por outras
entradas e pelo módulo do produto através das facades exportadas por `ProfessionalModule`
(`forRoot`), na regra de que **toda leitura cross-module passa por uma facade do módulo dono**:

- `ProfessionalDirectoryFacade` — `isActiveProfessional`, `searchAssignable`, `findByIds`,
  `listActive`, `listActiveByArea`, `findAreaIdsByProfessionalIds`,
  `findActiveProfessionalIdsByServices`, `findActiveProfessionalLinksByServices`.
- `ProfessionalAssignmentFacade` — o vínculo profissional↔serviço editado POR SERVIÇO.
- `professional-tables.facade.ts` — só o formato das linhas de agenda.

`ProfessionalModule.forRoot({ product })` abre o slot de produto para `ProfessionalScope` e
`ProfessionalCommitments`; sem ele, os null objects respondem.

## Portas do kernel consumidas

- `shared/infra/database/drizzle.provider`
- `shared/kernel/errors/domain.error`
- `shared/kernel/listing/paginated`

As três portas do recorte — `ProfessionalAssignmentRepository`, `ProfessionalCommitments` e
`ProfessionalScope` — são **locais da entrada** (AD-014), em `api/domain/ports/`. Nenhum token
sobe para `shared/kernel/**`: sem ciclo, não há o que inverter (AD-025).

## Dados

Schema lógico `professional` (`api/infrastructure/tables/professional.schema.ts`). Oito tabelas,
em seis arquivos:

| Tabela                                     | Arquivo                                      | Origem                                                            |
| ------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------- |
| `professional_profile`                     | `professional-profile.table.ts`              | nova — recebe `serves_clients` e `birth_date` de `identity.users` |
| `user_professional_areas`                  | `user-professional-area.table.ts`            | movida do `identity`, colunas inalteradas                         |
| `user_professional_services`               | `user-professional-service.table.ts`         | movida do `identity`, colunas inalteradas                         |
| `user_scheduling_areas`                    | `user-scheduling-area.table.ts`              | movida do `identity`, colunas inalteradas                         |
| `user_professional_schedule_configs`       | `user-professional-schedule-config.table.ts` | movida do `identity`, colunas inalteradas                         |
| `user_professional_schedule_config_slots`  | `user-professional-schedule-config.table.ts` | movida do `identity`, colunas inalteradas                         |
| `user_professional_schedule_config_blocks` | `user-professional-schedule-config.table.ts` | movida do `identity`, colunas inalteradas                         |
| `professional_default_hours`               | `professional-default-hours.table.ts`        | movida do `identity`, colunas inalteradas                         |

`professional_profile.user_id` é PK e FK para `identity.users.id` com `ON DELETE CASCADE`; as
sete tabelas movidas mantêm as FKs que já tinham para o usuário, agora cruzando o schema.

As migrações são geradas **no filho** pelo `module add` a partir das tabelas TS (AD-015); o
template versiona apenas o TS e o SQL manual de `migrations/custom/*.sql`.

`migrations/custom/01_audit_attach_professional.sql` declara `professional.attach_audit()` com
as **oito** tabelas (as sete movidas mais `professional_profile`) e a `PERFORM`a sob o guard de
`pg_proc`: quem executa o hook é `audit.attach_module_hooks()`, no fim da instalação do audit
(AD-032). `professional_profile` entra na lista porque recebeu `serves_clients` e `birth_date` de
`identity.users`, que já era auditada — deixá-la de fora perderia trilha que o filho tinha.

O SQL é só metade: as mesmas oito tabelas precisam estar declaradas do lado TS, em `AUDITED` e
`BASE_AUDITED_TABLES` da entrada `audit` (`domain/audit-coverage.ts`,
`domain/base-audit-registrations.ts`), com o schema `professional` em `MODULE_SCHEMAS`. **Tabela
nova nesta entrada mexe nos dois lugares** — só no SQL, o `audit-coverage.int-spec` do filho
acusa trigger sem declaração; só no TS, acusa declaração sem trigger. A declaração mora na
entrada `audit` porque `AuditRegistry.registerTables` indexa por nome puro de tabela e uma
segunda registração lança `DuplicateAuditRegistrationError`; esta entrada não tem `audit` em
`dependsOn` e não pode importá-la (RULE C). É a mesma razão pela qual o alvo de FK
`professional_user_id` continua no base set do `audit`.

## Decisões

- **Corte no agregado, não na tabela** (AD-035). `servesClients` e `birthDate` saem da entidade
  `User` e passam a viver no agregado `ProfessionalProfile`, chaveado 1:1 no usuário, junto com
  a validação `assertValidBirthDate()` que era privada do `User` — data real, não-futura,
  idade ≤ 120.
- **Nenhum token sobe para o kernel.** Como o `identity` deixa de chamar o recorte, o ciclo
  `identity <-> professional` nunca se forma e a aresta única fica declarada em `dependsOn`
  (AD-025 narrows AD-021/AD-024; RULE C do `module-boundaries.spec.ts` continua valendo).
- **`kernelRange` nasce `>=2.0.0 <3.0.0`.** O range acompanha a versão mais recente do
  `docs/dev/template-changelog.md` (AD-033); abre junto com o heading do próximo major.

### Débito herdado do `identity` — declarado, não novo

Os dois itens abaixo **já existiam** no recorte enquanto ele morava no `identity`. Eles
atravessam a extração intactos: nada aqui os cria e nada aqui os resolve.

1. **Um consumidor que não existe.** O `professional-assignment.module.ts` do `identity` se
   documentava como "superfície leaf para o `ServiceModule`", e o `ProfessionalAssignmentFacade`
   descreve política que "mora no consumidor". Não existe entrada `service` no catálogo: esse
   consumidor **não é distribuído em lugar nenhum**. A facade continua publicada porque um
   produto pode montar o seu; a entrada não ganhou um módulo leaf separado — `ProfessionalModule`
   é a única superfície, e o texto que apontava para o `ServiceModule` some com o arquivo.
2. **Duas referências penduradas.** `user_professional_services.service_id` e
   `user_professional_areas.area_id`/`user_scheduling_areas.area_id` são `text` **sem FK**,
   apontando por id para `service.services` e `service.areas` — tabelas de um schema que
   nenhuma entrada do catálogo cria. A validação é de use-case, via `ProfessionalScope`, cujo
   null object aceita tudo quando o produto não está montado. As colunas foram movidas
   verbatim: mudá-las aqui seria uma migração de dados fora do escopo da extração.

## Paridade

Os specs de integração (`api/infrastructure/repositories/*.int-spec.ts`) rodam no filho, contra o
Postgres de teste do harness — nunca contra um mock de banco. O truncate das tabelas do recorte
mora dentro do próprio spec: as tabelas são da entrada e saem com ela.

Esta entrada ainda não distribui specs de paridade — não há `parity/` nem
`contract.snapshot.json`. Não havendo rota HTTP própria, não há contrato OpenAPI a fixar; a
superfície in-process é coberta pelos specs unitários e de integração da própria entrada.

## Dependências

- `dependsOn`: `identity` (`>=3.0.0 <4.0.0`). A aresta é de produção: as tabelas do recorte
  referenciam `identity.users.id` e o perfil profissional é 1:1 com o usuário. Ela não fecha
  ciclo — depois do corte o `identity` não importa nada desta entrada.
- A aresta tem **duas formas, com pesos diferentes**. (1) FK física: as tabelas do recorte
  declaram `.references(() => users.id)` porque integridade referencial é do banco, e o recorte
  é do próprio agregado do `identity` — não de uma vizinha (`attachment`/`notification` guardam
  id lógico sem FK justamente por serem vizinhas). Os cinco pares estão nomeados, arquivo a
  arquivo, na `CROSS_MODULE_ALLOWLIST` de `module-boundaries.spec.ts`. (2) Leitura: nenhuma. Os
  adapters consomem `UserDirectoryFacade.listActiveByIds`/`searchActive` — a entrada manda os
  ids que o critério dela seleciona e o `identity` responde pelo estado da conta. É o que
  AD-035 existe para tirar, e a allowlist é estreita o bastante para continuar reprovando um
  `SELECT` sobre `identity.users` vindo daqui.
- `env`: nenhuma. A entrada não lê `process.env`.

## Parte web

Esta entrada não distribui nenhuma parte web — não há `web/core` nem `web/react`.

## Follow-ups absorvidos

Nenhum. `module.json.absorbs` está vazio.
