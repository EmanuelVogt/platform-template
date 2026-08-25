import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { expectContractSubset } from "../../../shared/test/parity/contract-snapshot"

type SnapshotDocument = {
  paths: Record<string, Record<string, { operationId?: string }>>
}

const SNAPSHOT_PATH = join(__dirname, "contract.snapshot.json")
// SPEC_DEVIATION: cwd passa a ser a raiz do repo (root `vitest run --project api`),
// não mais `apps/api` — não sobe mais dois níveis para achar o openapi.json.
// Reason: migração Jest -> Vitest trocou a invocação por pacote pelo `test` de raiz.
const OPENAPI_PATH = join(process.cwd(), "openapi.json")

const snapshot = JSON.parse(
  readFileSync(SNAPSHOT_PATH, "utf-8")
) as SnapshotDocument

function snapshotOperationIds(): string[] {
  return Object.values(snapshot.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .map((operation) => operation.operationId)
    .filter(
      (operationId): operationId is string => typeof operationId === "string"
    )
}

describe("paridade de contrato do identity", () => {
  it("congela as 34 operações que o identity expunha na v0.2", () => {
    const operationIds = snapshotOperationIds()

    expect(operationIds).toHaveLength(34)
    expect(operationIds).toEqual(
      expect.arrayContaining(["login", "getSession", "logout", "listUsers"])
    )
  })

  it("o openapi do child mantém toda operação do snapshot com os mesmos campos obrigatórios", () => {
    expectContractSubset(OPENAPI_PATH, snapshot)
  })
})
