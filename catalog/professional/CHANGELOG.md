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
