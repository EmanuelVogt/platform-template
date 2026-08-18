# ADRs — índice

Um registro por decisão, formato `NNNN-titulo.md`. Linha = título do ADR.

## Como escrever um ADR

Quatro blocos, nesta ordem, em pt-BR. Teto: **~30 linhas**; passar disso exige que o
excedente seja decisão, nunca narrativa.

```markdown
# NNNN — Título

Status: Aceito (AAAA-MM-DD)

**Decisão.** Os pontos, numerados quando houver mais de um.

**Porquê.** O racional NÃO-óbvio, em até 4 frases: a armadilha, o trade-off, o que
outro dev tentaria e quebraria.

**Consequências.** Só as não-óbvias, em bullets. Nenhuma? Omita a seção.
```

**Fica de fora**: a história de como o bug foi descoberto, walkthrough de código,
segundo exemplo, e detalhe de trava que o typecheck/lint/teste já garante (a trava vale
meia linha). O leitor tem o código na mão — o ADR carrega o que o código não conta.

**Decisão superada nunca é apagada.** Marque `~~tachado~~` + **superado/revertido**, e
some ao `Status:` uma linha por revisão apontando para o ADR que a substituiu. Um ADR
totalmente superado continua no índice: ele é a única explicação do que existiu antes.

**Antes de numerar, olhe o disco** (`ls docs/adr`) — o próximo número é o maior + 1.
Branches paralelas já criaram uma colisão (dois `0035-*`), que obriga quem cita a
desambiguar pelo nome do arquivo.


**Referências herdadas.** Os handbooks (`docs/back`, `docs/front`) citam ADRs pelo número
(`ADR 0089` etc.) — são decisões do projeto de origem do template e não viajam com ele.
A regra citada continua válida onde está escrita; o ADR de origem é só o histórico.
Este índice começa vazio: o primeiro ADR deste produto é o `0001`.
