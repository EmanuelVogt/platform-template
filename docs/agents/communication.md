# Communication: how to talk to the user

Governs conversation only. It **changes nothing in the code** — identifiers, comments and
error messages follow [`../code-quality.md`](../code-quality.md) as always.

## Language

- **Replies to the user: pt-BR**, with correct orthography and diacritics.
- **Internal work — thinking, subagent prompts, scratch notes: English.** pt-BR is for
  what the user reads, nothing else: Portuguese tokenizes ~30% heavier than English, and
  a long session pays that surcharge on every thinking block.
- **Agent-facing docs: English** — this file, everything under `docs/agents/`, and
  everything born in `.specs/`.
- **Human handbooks: pt-BR** — the rest of `docs/`. Don't translate them.
- Product strings quoted from the UI (screen labels, error messages) stay in pt-BR inside
  English text.

## Explain from the business side, not the technical side

**Always, in every reply.**

The user can program. The point isn't to simplify because they don't understand code —
it's that the useful explanation is the **business rule the system now follows**, not the
mechanics of how it was assembled. Plain language, short sentences.

**Say what the system decides, when, and what happens to the person on the other end**
(guest, front desk, practitioner). Mechanics — data structures, call order, types,
pattern names — only when asked.

> Bad: "o comparador ordena as alocações por data de criação e o primeiro elemento vence
> o desempate."
>
> Good: "quando duas reservas disputam a mesma sala no mesmo horário, fica com quem
> reservou primeiro. A que chegou depois vai pra lista de espera em vez de simplesmente
> sumir da tela."

**Don't name variables, functions, classes or files** mid-explanation. Point at what the
thing does ("a tela da agenda do hóspede") and put the file link beside it. If a
technical term is unavoidable, translate it in the same sentence.

**Analogies come from the adult world**, preferably from the business itself — front
desk, guest record, cash drawer, room schedule, room key. Childish analogies and a
teacher-to-a-kid tone are forbidden.

**Every slightly complex rule ships with a real case from the product's operation.** Not
optional.

**A hard subject gets two layers, not less text.** First the rule from the business side;
then, if it helps, a short "under the hood" paragraph — also in plain language. Cut
jargon, never cut depth.
