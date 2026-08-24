import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, it } from "vitest"

import { expectContractSubset } from "../../../shared/test/parity/contract-snapshot"

describe("audit — contrato HTTP", () => {
  it("mantém no openapi.json do child as operações do snapshot", () => {
    const snapshot = JSON.parse(
      readFileSync(join(__dirname, "contract.snapshot.json"), "utf-8")
    ) as Parameters<typeof expectContractSubset>[1]

    // SPEC_DEVIATION: cwd passa a ser a raiz do repo (root `vitest run --project api`),
    // não mais `apps/api` — não sobe mais dois níveis para achar o openapi.json.
    // Reason: migração Jest -> Vitest trocou a invocação por pacote pelo `test` de raiz.
    expectContractSubset(join(process.cwd(), "openapi.json"), snapshot)
  })
})
