import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expectContractSubset } from "./contract-snapshot"

function writeOpenApi(doc: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "contract-snapshot-"))
  const path = join(dir, "openapi.json")
  writeFileSync(path, JSON.stringify(doc))
  return path
}

const snapshot = {
  paths: {
    "/users": {
      post: {
        operationId: "createUser",
        requestBody: {
          content: {
            "application/json": {
              schema: { required: ["name", "email"] },
            },
          },
        },
      },
    },
  },
}

describe("expectContractSubset", () => {
  it("passa quando o child reproduz a operação do snapshot", () => {
    const childPath = writeOpenApi(snapshot)

    expect(() => {
      expectContractSubset(childPath, snapshot)
    }).not.toThrow()
  })

  it("falha nomeando a operationId ausente no child", () => {
    const childPath = writeOpenApi({ paths: {} })

    expect(() => {
      expectContractSubset(childPath, snapshot)
    }).toThrow(/createUser/)
  })

  it("falha nomeando a operação e o campo obrigatório alterado", () => {
    const childPath = writeOpenApi({
      paths: {
        "/users": {
          post: {
            operationId: "createUser",
            requestBody: {
              content: {
                "application/json": {
                  schema: { required: ["name"] },
                },
              },
            },
          },
        },
      },
    })

    expect(() => {
      expectContractSubset(childPath, snapshot)
    }).toThrow(/createUser/)
    expect(() => {
      expectContractSubset(childPath, snapshot)
    }).toThrow(/email/)
  })

  it("passa quando o child tem operações extras além do snapshot", () => {
    const childPath = writeOpenApi({
      paths: {
        "/users": {
          post: snapshot.paths["/users"].post,
          get: { operationId: "listUsers" },
        },
      },
    })

    expect(() => {
      expectContractSubset(childPath, snapshot)
    }).not.toThrow()
  })
})
