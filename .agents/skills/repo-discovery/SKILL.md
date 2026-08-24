---
name: repo-discovery
description: How to find code in this repo — where a symbol is defined, who consumes a route/component/operationId, where a module's rule lives — directly or when briefing a discovery subagent. Covers the two couplings grep cannot see.
---

# Descoberta de código

Procurar código é o maior gasto de contexto deste repo — medido, 87% de toda a
saída de shell, contra 1% de testes. Esta skill é o que torna a busca barata e o
que evita as duas respostas erradas que o `grep` dá com cara de certa.

## Onde as coisas moram

- `apps/api/src/modules/<módulo>/` — monólito modular, 19 módulos. Camadas:
  `domain/entities`, `application` (use cases), `infrastructure`, `api`.
- `apps/web/src/` — Feature-Sliced Design: `app`, `pages`, `widgets`, `features`,
  `entities`, `shared`. **Sem barrels**: o símbolo vem do arquivo que o define,
  então o import de um consumidor já entrega o caminho exato.
- `packages/` — `api-client` (gerado por Kubb), `ui`, configs.
- Decisões estruturais em `docs/adr/`; vocabulário de negócio em `docs/CONTEXT.md`.

Confirme no disco antes de afirmar (`ls apps/api/src/modules`) — inventário
decorado envelhece, e este arquivo não é inventário.

## Como buscar barato

- Use `grep`, **nunca `rg`**: o proxy rtk comprime a saída de `grep` e ignora
  `rg` por completo (`exclude_commands`, ver [`../../../docs/agents/harness.md`](../../../docs/agents/harness.md)).
- `grep -rl` primeiro para saber *onde*, e só então abra o trecho. `grep -rn`
  largo despeja conteúdo que não vai ser usado e fica no contexto até o fim.
- Comece por um consumidor quando der: uma linha de import responde "onde isso é
  definido" sem busca nenhuma.

**Nunca abra inteiro** um arquivo grande: `openapi.json` (~255k tokens),
`pnpm-lock.yaml` (~184k), `packages/api-client/generated/index.ts` (~74k),
`apps/api/drizzle/migrations/meta/*_snapshot.json` (~72k cada) e as fixtures de
integração de um módulo grande (~57k cada). Uma leitura dessas custa mais que o
pico de uma sessão inteira. Faixa (`offset`/`limit`), `grep -n` ou `head` continuam valendo —
o que não vale é o arquivo todo. No Claude Code um hook barra isso por tamanho
(`no-huge-reads.mjs`) e outro barra a navegação direta no agente principal a partir
da terceira chamada do turno, mandando para o subagente `repo-scout`
(`delegate-to-subagent.mjs`); no Cursor e no Codex a trava é você.

## Os dois pontos cegos do grep aqui

Análise estática — inclusive ferramenta de grafo de código — enxerga **import**.
Os dois acoplamentos que mais importam neste projeto não são import:

1. **Contrato api→web é gerado por build.** O front importa `@platform/api-client`
   em centenas de arquivos, mas o `exports` do pacote aponta para `./dist/*`, que
   não é versionado. O elo api → `openapi.json` → Kubb → web não existe no fonte.
   Para "mudei o contrato, quem quebra no front", a resposta é
   `pnpm contract:consumers <operationId>` e `pnpm contract:diff` — não grep.

2. **Autorização liga por metadata em runtime.** O guard lê a chave via
   `Reflector`; quem *implementa* a regra não importa o decorator dela. Buscar
   pelo nome do decorator devolve os usos e esconde a implementação.

Medido: numa pergunta desse segundo tipo, `grep` devolveu 136 arquivos em 12k
chars e um grafo de código devolveu 132 em 43k — 3,6× mais caro e sem a peça que
implementava a regra. Por isso aqui não há ferramenta de grafo.

## O que uma descoberta devolve

`arquivo:linha` mais uma frase do que existe ali. Nada além disso.

Sem colar conteúdo de arquivo, sem explicar a arquitetura a quem perguntou, sem
recomendar solução. Três caminhos que respondem = três linhas.

Não achou? Diga isso e diga onde procurou. Um "não existe" honesto vale mais que
um palpite que manda quem perguntou para o arquivo errado.

**Por que tão enxuto:** quando a descoberta roda num subagente, tudo que ele
devolve é repago no contexto de quem chamou, em todo turno seguinte. O valor da
delegação é o contexto principal receber o mapa, não a viagem.
