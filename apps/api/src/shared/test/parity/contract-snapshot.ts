import { readFileSync } from "node:fs"

interface JsonSchemaObject {
  required?: string[]
  [key: string]: unknown
}

interface OpenApiOperation {
  operationId?: string
  requestBody?: { content?: Record<string, { schema?: JsonSchemaObject }> }
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchemaObject }> }>
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>
}

function collectOperations(doc: OpenApiDocument): Map<string, OpenApiOperation> {
  const operations = new Map<string, OpenApiOperation>()
  for (const pathItem of Object.values(doc.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (operation.operationId) {
        operations.set(operation.operationId, operation)
      }
    }
  }
  return operations
}

function collectRequiredFields(operation: OpenApiOperation): Set<string> {
  const schemas = [
    ...Object.values(operation.requestBody?.content ?? {}).map((entry) => entry.schema),
    ...Object.values(operation.responses ?? {}).flatMap((response) =>
      Object.values(response.content ?? {}).map((entry) => entry.schema),
    ),
  ]
  const required = new Set<string>()
  for (const schema of schemas) {
    for (const field of schema?.required ?? []) {
      required.add(field)
    }
  }
  return required
}

/**
 * Confere que o `openapi.json` do child ainda contém, por operationId, toda
 * operação do `snapshot` da entry com schema compatível (mesmos campos
 * obrigatórios). Operações extras no child são permitidas.
 */
export function expectContractSubset(openapiPath: string, snapshot: OpenApiDocument): void {
  const child = JSON.parse(readFileSync(openapiPath, "utf-8")) as OpenApiDocument
  const childOperations = collectOperations(child)

  for (const [operationId, snapshotOperation] of collectOperations(snapshot)) {
    const childOperation = childOperations.get(operationId)
    if (!childOperation) {
      throw new Error(`contract-snapshot: operação "${operationId}" ausente no openapi do child`)
    }

    const snapshotRequired = collectRequiredFields(snapshotOperation)
    const childRequired = collectRequiredFields(childOperation)

    for (const field of snapshotRequired) {
      if (!childRequired.has(field)) {
        throw new Error(
          `contract-snapshot: operação "${operationId}" perdeu o campo obrigatório "${field}"`,
        )
      }
    }
    for (const field of childRequired) {
      if (!snapshotRequired.has(field)) {
        throw new Error(
          `contract-snapshot: operação "${operationId}" mudou o campo obrigatório "${field}"`,
        )
      }
    }
  }
}
