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
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

A entrada não publica rota HTTP própria: sua superfície é in-process, consumida por outras
entradas e pelo módulo do produto através das facades exportadas por `ProfessionalModule`.

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

| Tabela | Arquivo | Origem |
| --- | --- | --- |
| `professional_profile` | `professional-profile.table.ts` | nova — recebe `serves_clients` e `birth_date` de `identity.users` |
| `user_professional_areas` | `user-professional-area.table.ts` | movida do `identity`, colunas inalteradas |
| `user_professional_services` | `user-professional-service.table.ts` | movida do `identity`, colunas inalteradas |
| `user_scheduling_areas` | `user-scheduling-area.table.ts` | movida do `identity`, colunas inalteradas |
| `user_professional_schedule_configs` | `user-professional-schedule-config.table.ts` | movida do `identity`, colunas inalteradas |
| `user_professional_schedule_config_slots` | `user-professional-schedule-config.table.ts` | movida do `identity`, colunas inalteradas |
| `user_professional_schedule_config_blocks` | `user-professional-schedule-config.table.ts` | movida do `identity`, colunas inalteradas |
| `professional_default_hours` | `professional-default-hours.table.ts` | movida do `identity`, colunas inalteradas |

`professional_profile.user_id` é PK e FK para `identity.users.id` com `ON DELETE CASCADE`; as
sete tabelas movidas mantêm as FKs que já tinham para o usuário, agora cruzando o schema.

As migrações são geradas **no filho** pelo `module add` a partir das tabelas TS (AD-015); o
template versiona apenas o TS e o SQL manual de `migrations/custom/*.sql`.

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

## Paridade

Esta entrada ainda não distribui specs de paridade — não há `parity/` nem
`contract.snapshot.json`. Não havendo rota HTTP própria, não há contrato OpenAPI a fixar; a
superfície in-process é coberta pelos specs unitários e de integração da própria entrada.

## Dependências

- `dependsOn`: `identity` (`>=3.0.0 <4.0.0`). A aresta é de produção: as tabelas do recorte
  referenciam `identity.users.id` e o perfil profissional é 1:1 com o usuário. Ela não fecha
  ciclo — depois do corte o `identity` não importa nada desta entrada.
- `env`: nenhuma. A entrada não lê `process.env`.

## Parte web

Esta entrada não distribui nenhuma parte web — não há `web/core` nem `web/react`.

## Follow-ups absorvidos

Nenhum. `module.json.absorbs` está vazio.
