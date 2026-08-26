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
- `professional-query.helpers.ts`: "profissional atribuível" tem dois donos. O recorte
  (`serves_clients`) é desta entrada e sai de `professional.professional_profile`; o estado da
  conta (ativo, não excluído) e as colunas do usuário são do `identity` e chegam pela
  `UserDirectoryFacade` (`listActiveByIds`, `searchActive`). Nenhuma leitura da entrada importa
  `identity.users`: as tabelas mantêm a FK física, os SELECTs não atravessam.
- Spec de integração do repositório com 5 casos, sobre o Postgres de teste (sem mock de banco).
- Facades da entrada (`api/api/facades/`): `ProfessionalDirectoryFacade` (diretório de
  atribuíveis, agora sobre o port local `ProfessionalDirectoryReader` e não mais sobre o
  `UserRepository` do identity), `ProfessionalAssignmentFacade` e `professional-tables.facade`.
- `ProfessionalModule.forRoot({ product })` monta portas, adapters e facades e abre o slot de
  produto para `ProfessionalScope`/`ProfessionalCommitments`, com null objects por padrão.
- `migrations/custom/01_audit_attach_professional.sql`: a entrada declara e `PERFORM`a a própria
  `professional.attach_audit()` sob o guard de `pg_proc` (AD-032), cobrindo as oito tabelas.
- Cobertura da trilha do lado TS: as oito tabelas entram em `AUDITED` e o schema `professional`
  em `MODULE_SCHEMAS` (`audit/api/domain/audit-coverage.ts`), com as oito registrações
  correspondentes em `BASE_AUDITED_TABLES` — dono `admin.users.audit.read`, e as sete satélites
  do usuário com raiz de agregado `users`, como era antes do corte. A declaração fica na
  entrada `audit`, e não aqui, porque `registerTables` indexa por nome puro de tabela (uma
  segunda registração lança `DuplicateAuditRegistrationError`), esta entrada não tem `audit` em
  `dependsOn` e o `audit-coverage.int-spec` lê a lista da própria entrada — o mesmo motivo pelo
  qual o alvo de FK `professional_user_id` permanece no base set. Sem isso, `attach_audit()`
  anexava oito triggers que nenhuma lista declarava e o int-spec de cobertura ficava vermelho
  em todo filho que instala as duas entradas.
- README registra o débito herdado do `identity`: o consumidor `ServiceModule`/`service` que não
  é distribuído por nenhuma entrada, e `area_id`/`service_id` como `text` sem FK.
