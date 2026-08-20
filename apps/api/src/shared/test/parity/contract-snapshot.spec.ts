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

interface SchemaFixture {
  $ref?: string
  type?: string
  required?: string[]
  properties?: Record<string, SchemaFixture>
  items?: SchemaFixture
}

interface OperationFixture {
  operationId: string
  requestBody?: { content: Record<string, { schema: SchemaFixture }> }
  responses?: Record<string, { content: Record<string, { schema: SchemaFixture }> }>
}

interface DocumentFixture {
  paths: Record<string, Record<string, OperationFixture>>
  components: { schemas: Record<string, SchemaFixture> }
}

const userDto: SchemaFixture = {
  type: "object",
  properties: {
    id: { type: "string" },
    email: { type: "string" },
    roles: { type: "array", items: { type: "string" } },
    manager: { $ref: "#/components/schemas/UserDto" },
  },
  required: ["id", "email"],
}

const refSnapshot: DocumentFixture = {
  paths: {
    "/users": {
      post: {
        operationId: "createUser",
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateUserDto" } },
          },
        },
        responses: {
          "201": {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/UserResponseDto" } },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      CreateUserDto: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          active: { type: "boolean" },
        },
        required: ["name", "email"],
      },
      UserResponseDto: {
        type: "object",
        properties: { user: { $ref: "#/components/schemas/UserDto" } },
        required: ["user"],
      },
      UserDto: userDto,
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

  it("passa com o contrato com $ref idêntico nos dois lados, inclusive com $ref circular", () => {
    const childPath = writeOpenApi(refSnapshot)

    expect(() => {
      expectContractSubset(childPath, refSnapshot)
    }).not.toThrow()
  })

  it("falha nomeando a operação e o campo quando o tipo por trás de um $ref muda", () => {
    const child = structuredClone(refSnapshot)
    child.components.schemas.UserDto = {
      ...userDto,
      properties: { ...userDto.properties, email: { type: "number" } },
    }
    const childPath = writeOpenApi(child)

    expect(() => {
      expectContractSubset(childPath, refSnapshot)
    }).toThrow(
      'contract-snapshot: operação "createUser" mudou o tipo do campo "responses.201.user.email" de "string" para "number"',
    )
  })

  it("falha nomeando a operação e o campo quando um obrigatório some por trás de um $ref", () => {
    const child = structuredClone(refSnapshot)
    child.components.schemas.UserDto = {
      ...userDto,
      required: ["id"],
    }
    const childPath = writeOpenApi(child)

    expect(() => {
      expectContractSubset(childPath, refSnapshot)
    }).toThrow(
      'contract-snapshot: operação "createUser" perdeu o campo obrigatório "responses.201.user.email"',
    )
  })

  it("passa quando o child acrescenta campo opcional por trás de um $ref e uma operação nova", () => {
    const child = structuredClone(refSnapshot)
    child.components.schemas.UserDto = {
      ...userDto,
      properties: {
        ...userDto.properties,
        nickname: { type: "string" },
      },
    }
    child.paths["/users"] = {
      ...refSnapshot.paths["/users"],
      get: { operationId: "listUsers" },
    }
    const childPath = writeOpenApi(child)

    expect(() => {
      expectContractSubset(childPath, refSnapshot)
    }).not.toThrow()
  })
})
