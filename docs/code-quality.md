# Code Quality — Regras obrigatórias

Cross-cutting. Vale `apps/api` e `apps/web`. **Leitura obrigatória antes de qualquer código.** Cada regra aqui reprova PR se violada. Arquitetura de área: `back/back-arch.md`, `front/front-arch.md`.

## Princípios

1. **YAGNI** — não implemente pra futuro hipotético. 3 linhas iguais > abstração prematura.
2. **Cirurgia, não rewrite** — edit foca no que muda. Refactor adjacente só quando reduz risco do fix.
3. **Trust the types** — sem defensivo redundante onde o tipo/framework garante. Boundary real (input externo, IO, parse) ainda precisa handling.
4. **Sem shim de compatibilidade** — mude direto. Sem feature flag pra coisa que não reverte.
5. **No comments by default** — código bem-nomeado se explica.
6. **Idioma fixo** — identificador em inglês; comentário/docstring/erro user-facing em pt-BR.

## Comentários

**Default: ZERO.** Comentário é exceção que o autor justifica. Sem caso válido apontado → defeito, review deleta. Arquivo com comentário em vários blocos reprova o PR.

**Teste de deleção — um "sim" deleta:**

1. Nome melhor elimina a necessidade? → renomeie.
2. Tipo/assinatura já garante? → redundante.
3. `git blame` + commit carregam (motivo, autor, PR, data)? → vai pro commit.

**Casos válidos (lista FECHADA — 4):**

1. Invariante não-óbvio que o tipo não captura — `// requer ORDER BY id ASC; cursor depende disso`.
2. Workaround de bug externo com referência — `// Safari <17: requestIdleCallback não dispara em background tab`.
3. Constraint de domínio fora do código adjacente — `// CPF pode ter zeros à esquerda — manter string`.
4. Decisão contraintuitiva que outro dev "consertaria" — `// sleep intencional: rate-limit Meta = 1 req/s`.

Não é um dos 4 → código mal-nomeado/mal-estruturado, conserte a causa.

**Comentário de IA — deletar à vista.** Reprovam PR: narração de passo (`// Step 1`, `// Now loop`), reafirmar a linha (`// incrementa contador`), parafrasear símbolo, sumário de bloco, banner/separador, JSDoc que repete assinatura, `// TODO: implement`. Ao revisar output de IA: apague todo comentário gerado, re-justifique do zero o que mantiver.

**Boy-scout ao editar.** Tocou num arquivo → audite os comentários pré-existentes da **região que mexeu** contra os 4 casos e apague o ruído (sobretudo gerado por IA) no mesmo edit. Escopo = região tocada, não o arquivo inteiro: não vira refactor amplo nem mistura com `feat`/`fix` no mesmo PR (edit cirúrgico).

**Também vetado:** TODO sem condição mensurável (ok: `// TODO(2026-Q3): remover após migração auth, issue #142`), comentário desatualizado ao editar adjacente, bloco multi-parágrafo em função (extrai função), código comentado (git guarda).

**JSDoc/TSDoc:** só em API pública (export consumido fora do módulo/slice) E quando a assinatura não cobre o contrato (idempotência, side-effect, ordering, lock). Documenta contrato, nunca implementação. Texto pt-BR; tags/tipos inglês. Parafrasear assinatura = comentário de IA, deletar.

## Idioma

- Identificadores (var, função, tipo, arquivo, branch, módulo): **inglês**.
- Comentário, docstring, erro user-facing: **pt-BR**.
- Termo técnico de stack (`stream`, `cache`, `webhook`, `payload`, `idempotente`, `outbox`): inglês.
- Log interno: pt-BR com termos de stack inglês (`unauthorized`, `forbidden`, `not found`, `timeout`).
- Nunca vazar stack/SQL/path interno em mensagem user-facing.

## Nomenclatura

Tabela de casing por tipo e naming de arquivo: back em `back-arch.md`, front em `front-arch.md` (DB Postgres no `back-arch.md`). Cross-cutting:

- Nome descreve **o que é**, não como funciona. `invoices` > `invoiceArray`.
- Boolean nunca negativo (`is/has/can/should`): `isEnabled`, nunca `isNotDisabled`.
- Função = verbo; classe/tipo = substantivo.
- Abreviação só universal no domínio (`id`, `url`, `db`, `ctx`). Sem `usr`, `mgr`.
- Singular = entidade; plural = coleção.

## Funções

- Curtas. Sinal em ~30 linhas; gate hard em 50 (review reprova).
- 1 responsabilidade; nome reflete a única coisa.
- Early return; evite aninhamento profundo.
- Até 3 parâmetros posicionais; mais = objeto `{ }`.
- Sem flag booleana (`send(invoice, true)`) — quebre em duas funções.
- Pura quando possível. `domain/` é exclusivamente puro.

## Tipagem TS

- `tsconfig` strict: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`. Vale nos dois apps, sem exceção — acesso por índice sempre entrega `| undefined` e o caso ausente tem que ser tratado.
- **`any` proibido** (ESLint error). `unknown` + narrowing.
- `unknown` em boundary externo (parse, IO); `never` em exhaustive check.
- `type` por padrão; `interface` só pra declaration merging.
- `as` só em boundary ou após narrowing. Nunca `as any` / `as unknown as X`.
- Discriminated union pra modelar estado/forma, **nunca** controle de fluxo de erro (use throw).
- Inferência em local; anote retorno de função exportada.
- Readonly em props, config, retorno de selector.
- Branded types pra IDs e VOs primitivos.

## Imports

- Ordem (grupos separados por linha em branco): builtins Node → libs externas → aliases (`@/`) → relativos → `import type` → side-effects.
- `import type` em tudo que é só tipo.
- Sem `import *` salvo namespace idiomático (`import * as z from 'zod'`).
- Sem default export salvo lazy route (TanStack/`React.lazy`) e config de plugin.
- Sem import circular (lint pega).
- Subpath > barrel em packages (`@platform/api-client/hooks/*` | `zod/*` | `models/*`).

## Erros

- **Throw é o único caminho de erro.** Nunca `Result<T>`/`Either`.
- Throw `Error` ou subclasse, nunca string/objeto solto.
- Classes customizadas no `domain/` (`extends DomainError`); filter global mapeia → RFC 7807.
- Sem swallow. `try/catch` que loga e continua precisa razão escrita (comentário caso 4).
- `unknown` no catch, sempre narrowing; re-throw o que não tratou.
- User-facing: pt-BR, sem stack/SQL/path. `correlationId` no envelope (RFC 7807 no back).
- Logs: passe `{ err }`, nunca `err.message` (perde stack).

## Async

- **Sem floating promise** (ESLint error). `await`, `.then()` ou `void` explícito.
- `Promise.all` em independentes; `await` em loop só com dependência.
- `AbortSignal` em fetch/IO longo (handler de evento, job).
- Sem `async` sem `await` dentro.
- Sem `new Promise((resolve, reject))` quando há API async nativa.

## Lint / format

- Prettier = formatador único, sem debate de estilo.
- ESLint: `typescript-eslint` strictTypeChecked + stylisticTypeChecked, `import-x` (ordem, no-cycle), `unused-imports`; front adiciona react/react-hooks/jsx-a11y.
- **Proibido suprimir lint** — sem `eslint-disable` em nenhuma forma, sem desligar regra no arquivo. Conflito com padrão obrigatório de framework → escalar ao user, nunca suprimir inline.
- CI bloqueia merge em lint/format/typecheck error.

## Testes

- Pirâmide: unit (`domain/` puro) > integration (`application/` + Postgres real) > e2e.
- Sem mock de banco em integration/e2e — `testcontainers`.
- Nome do teste descreve comportamento, não implementação.
- AAA: arrange, act, assert.
- Sem teste de getter/setter trivial.
- Cobertura: `domain/` (entidades + VOs) ≥ 80%. Restante = consequência, não meta.
- Snapshot só pra estrutura estável (OpenAPI, schema), nunca componente React.

## PR / escopo

- Escopo único declarado: `feat:` / `fix:` / `refactor:` não se misturam.
- Refactor adjacente só quando reduz risco do fix — justificar.
- Renomear em PR separado; move + rename = 2 commits.
- Sem reformatação massiva (sem PR "format only").

## Checklist de code review

CI cobre lint, format, typecheck, `any`, `console.log`, floating promise, import order. Review foca no resto.

```
□ Comentário só nos 4 casos; nada descritivo; JSDoc só contrato não-óbvio
□ Função: 1 responsabilidade, sem flag booleana, ≤50 linhas
□ Erro: subclasse de DomainError, throw é único caminho (sem Result<T>); sem swallow
□ Promise.all em paralelizáveis (await-in-loop só com dependência)
□ Testes nomeiam comportamento; sem mock de banco em integration/e2e; domain/ ≥ 80%
□ PR de escopo único; sem reformat massivo; sem eslint-disable
□ Idioma: identificador inglês; comentário/erro user-facing pt-BR
□ Cumpre handbook da camada (back-arch / front-arch)
```
