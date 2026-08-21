# Contrato do README de entrada do catálogo

Todo `README.md` de uma entrada do catálogo (`catalog/<name>[/<variant>]/README.md`) segue
uma estrutura fixa de seções H2 (`##`). O `catalog-lint` (script
`scripts/platform/catalog-lint.mjs`) lê a lista abaixo como **fonte única** das seções
obrigatórias e falha se alguma estiver ausente, fora de ordem, ou com título diferente do
literal exigido.

**A ordem é obrigatória.** As seções devem aparecer no README exatamente nesta sequência, com
o texto exato de cada título (sem variações de acentuação, caixa ou pontuação):

```
## Contrato
## Portas do kernel consumidas
## Dados
## Decisões
## Paridade
## Dependências
## Parte web
## Follow-ups absorvidos
```

## O que cada seção documenta

- **`## Contrato`** — tabela de rotas HTTP expostas pela entrada, com colunas de método, path,
  `operationId`, eventos publicados/consumidos e facades (serviços de aplicação) envolvidas.
- **`## Portas do kernel consumidas`** — lista das portas do kernel (`shared/kernel/**`,
  `shared/infra/**`) que os adaptadores da entrada implementam ou consomem.
- **`## Dados`** — schema (tabelas Drizzle em `api/**/tables`), lista das tabelas que a
  entrada possui e as migrações manuais em `migrations/custom/*.sql` (triggers, funções — nunca
  criação de tabela, que vem do código TS).
- **`## Decisões`** — lista estilo ADR das decisões de design específicas da entrada; é onde
  moram os sucessores locais de AD-003/004/007/008/009/010 quando a entrada precisa de uma
  variação desses acordos.
- **`## Paridade`** — como rodar os testes de paridade (`parity/*.parity.spec.ts`) e o que eles
  garantem (comparação contra `contract.snapshot.json`).
- **`## Dependências`** — outras entradas do catálogo exigidas via `dependsOn` e as variáveis de
  ambiente (`env` do `module.json`) que a entrada declara.
- **`## Parte web`** — o que existe em `web/core` e `web/react` (se houver) e receitas de
  integração (como consumir os hooks/opções em uma página ou rota do app filho).
- **`## Follow-ups absorvidos`** — issues do sweep v0.2 que esta entrada absorveu (campo
  `absorbs` do `module.json`), com um link ou identificador por item.

## Regras adicionais

- Seções vazias não são permitidas: se uma entrada não tem parte web, a seção `## Parte web`
  deve dizer explicitamente que não se aplica, não pode ser omitida.
- Nenhuma seção fora desta lista é obrigatória; seções extras podem existir após
  `## Follow-ups absorvidos`, mas nunca entre as oito acima.
