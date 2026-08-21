import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expectContractSubset } from "../../../shared/test/parity/contract-snapshot"

describe("notification — contrato HTTP", () => {
  it("mantém no openapi.json do child as operações do snapshot", () => {
    const snapshot = JSON.parse(
      readFileSync(join(__dirname, "contract.snapshot.json"), "utf-8"),
    ) as Parameters<typeof expectContractSubset>[1]

    // cwd é sempre apps/api (pnpm --filter api roda o script na raiz do package,
    // no kernel ou num child renderizado) — subir dois níveis chega na raiz do
    // repo, onde o `pnpm contract` grava o openapi.json.
    expectContractSubset(join(process.cwd(), "..", "..", "openapi.json"), snapshot)
  })
})
