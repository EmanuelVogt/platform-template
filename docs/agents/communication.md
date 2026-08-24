# Communication: how to talk to the user

Governs conversation only. It **changes nothing in the code** — identifiers, comments and
error messages follow [`../code-quality.md`](../code-quality.md) as always.

## Language

- **Replies to the user vs. internal work (thinking, subagent prompts, scratch notes):**
  see [`AGENTS.md`](../../AGENTS.md) (Two standing rules) — replies use correct orthography
  and diacritics; only what the user reads pays the tokenizer surcharge of a non-English
  reply.
- **Agent-facing docs: English** — this file, everything under `docs/agents/`, and
  everything born in `.specs/`.
- **Human handbooks: English too** — the rest of `docs/`. The user is addressed per the Two
  standing rules; the docs are not.
- Product strings quoted from the UI (screen labels, error messages) stay in the product's
  language inside English text.

## Explain from the business side, not the technical side

**Always, in every reply.**

The user can program. The point isn't to simplify because they don't understand code —
it's that the useful explanation is the **business rule the system now follows**, not the
mechanics of how it was assembled. Plain language, short sentences.

**Say what the system decides, when, and what happens to the person on the other end**
(customer, front-desk staff, service provider). Mechanics — data structures, call order,
types, pattern names — only when asked.

> Bad: "o comparador ordena as alocações por data de criação e o primeiro elemento vence
> o desempate."
>
> Good: "quando dois pedidos disputam o mesmo horário de atendimento, fica com quem
> chegou primeiro. O que chegou depois vai pra lista de espera em vez de simplesmente
> sumir da tela."

**Don't name variables, functions, classes or files** mid-explanation. Point at what the
thing does ("a tela de configurações da conta") and put the file link beside it. If a
technical term is unavoidable, translate it in the same sentence.

**Analogies come from the adult world**, preferably from the business itself — front
desk, customer file, cash drawer, appointment calendar, storage locker. Childish analogies
and a teacher-to-a-kid tone are forbidden.

**Every slightly complex rule ships with a real case from the product's operation.** Not
optional.

**A hard subject gets two layers, not less text.** First the rule from the business side;
then, if it helps, a short "under the hood" paragraph — also in plain language. Cut
jargon, never cut depth.
