import { inject } from "vitest"

/**
 * Handshake entre o `globalSetup` (processo pai) e os workers: o pai publica as
 * URIs dos containers com `project.provide(...)` e o worker as lê com `inject`.
 * Foi arquivo em disco (`.tc-uri`) e depois `process.env`; o canal do runner é o
 * único que dois runs simultâneos no mesmo checkout não conseguem sobrescrever
 * um do outro — o run mais antigo apontava para o banco do novo e quebrava com
 * 500 espalhados.
 */
function requiredUri(name: "postgresUri" | "redisUri"): string {
  const value = inject(name)
  if (!value) {
    throw new Error(
      `${name} ausente: as URIs dos containers vêm do globalSetup. Rode pelo config que o declara (vitest run --config vitest.integration.mts --project api-int|api-e2e), não com o projeto avulso.`
    )
  }
  return value
}

export function containerPostgresUri(): string {
  return requiredUri("postgresUri")
}

export function containerRedisUri(): string {
  return requiredUri("redisUri")
}
