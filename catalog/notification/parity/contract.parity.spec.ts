import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expectContractSubset } from "../../../shared/test/parity/contract-snapshot"

describe("notification — contrato HTTP", () => {
  it("mantém no openapi.json do child as operações do snapshot", () => {
    const snapshot = JSON.parse(
      readFileSync(join(__dirname, "contract.snapshot.json"), "utf-8"),
    ) as Parameters<typeof expectContractSubset>[1]

    expectContractSubset(join(process.cwd(), "openapi.json"), snapshot)
  })
})
