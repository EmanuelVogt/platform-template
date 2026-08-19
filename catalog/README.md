# Índice do catálogo

Lista de entradas do catálogo disponíveis para `pnpm platform module add <name> [--variant]`.
Cada entrada mora em `catalog/<name>[/<variant>]/` e segue o modelo descrito em
[`docs/catalog/catalog.md`](../docs/catalog/catalog.md); o README de cada entrada segue o
contrato fixo de seções em [`docs/catalog/README-contract.md`](../docs/catalog/README-contract.md).

## Entradas

| Entrada | Variante | Versão | Descrição |
| --- | --- | --- | --- |
| identity | single-tenant | pendente | pendente — entrada chega na wave 3 (T17) |
| attachment | — | pendente | pendente — entrada chega na wave 3 |
| audit | — | pendente | pendente — entrada chega na wave 3 |
| notification | — | pendente | pendente — entrada chega na wave 3 |
| tag | — | pendente | pendente — entrada chega na wave 3 |

## Como adicionar uma entrada a um app filho

```bash
pnpm platform module add <name> [--variant <variant>]
```

O comando copia o código da entrada para dentro do app filho, resolve `dependsOn`, gera
migrações via `drizzle-kit generate` e registra a versão adicionada em
`.platform-modules.lock`.

## Como autorar uma nova entrada

Ver [`docs/catalog/catalog.md`](../docs/catalog/catalog.md) para o modelo completo de uma
entrada, a regra raw-web da parte web, os gates de lint/check e o fluxo de advisories.
