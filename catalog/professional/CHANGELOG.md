# Changelog — `professional`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

## [1.0.0]

### Added

- Entrada nova (AD-035, AD-013): esqueleto do recorte profissional/agenda extraído do
  `identity` — `module.json`, README, changelog, schema lógico `professional` e
  `ProfessionalModule`.
- `kernelRange` nasce `>=2.0.0 <3.0.0`, acompanhando a versão mais recente do
  `docs/dev/template-changelog.md` (AD-033).
- `dependsOn: identity` carrega sozinha a aresta com o `identity`: o corte no agregado
  desfaz o ciclo e nenhum token sobe para `shared/kernel/**` (AD-025, AD-021/AD-024).
- Tabela nova `professional_profile` (`user_id` PK + FK para `identity.users.id` com
  `ON DELETE CASCADE`, `serves_clients`, `birth_date`, `created_at`, `updated_at`) e as sete
  tabelas movidas verbatim do `identity` — `user_professional_areas`,
  `user_professional_services`, `user_scheduling_areas`,
  `user_professional_schedule_configs`, `user_professional_schedule_config_slots`,
  `user_professional_schedule_config_blocks` e `professional_default_hours`. Colunas
  inalteradas; `area_id`/`service_id` seguem `text` sem FK (débito herdado, declarado no
  README).
- Agregado `ProfessionalProfile` (`api/domain/entities/`) com `servesClients`, `birthDate` e
  a validação `assertValidBirthDate()` movida do `User`, mais os erros locais
  `InvalidBirthDateError` e `InvalidProfessionalScopeError`.
- As três portas do recorte passam a ser locais da entrada (AD-014):
  `ProfessionalAssignmentRepository`, `ProfessionalCommitments` e `ProfessionalScope`.
- Adapters das três portas em `api/infrastructure/repositories/`:
  `DrizzleProfessionalAssignmentRepository` (todo o SQL da entrada) e os null objects
  `NullProfessionalScope`/`NullProfessionalCommitments` para o filho sem produto montado.
- `professional-query.helpers.ts`: "profissional atribuível" passa a juntar
  `professional.professional_profile` — `serves_clients` não é mais coluna de `identity.users`.
- Spec de integração do repositório com 5 casos, sobre o Postgres de teste (sem mock de banco).
- Facades da entrada (`api/api/facades/`): `ProfessionalDirectoryFacade` (diretório de
  atribuíveis, agora sobre o port local `ProfessionalDirectoryReader` e não mais sobre o
  `UserRepository` do identity), `ProfessionalAssignmentFacade` e `professional-tables.facade`.
- `ProfessionalModule.forRoot({ product })` monta portas, adapters e facades e abre o slot de
  produto para `ProfessionalScope`/`ProfessionalCommitments`, com null objects por padrão.
