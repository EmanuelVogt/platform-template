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
