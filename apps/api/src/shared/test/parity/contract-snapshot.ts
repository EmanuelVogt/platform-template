import { readFileSync } from "node:fs"

interface JsonSchemaObject {
  $ref?: string
  type?: string
  required?: string[]
  properties?: Record<string, JsonSchemaObject>
  items?: JsonSchemaObject
}

interface MediaTypeObject {
  schema?: JsonSchemaObject
}

interface OpenApiOperation {
  operationId?: string
  requestBody?: { content?: Record<string, MediaTypeObject> }
  responses?: Record<string, { content?: Record<string, MediaTypeObject> }>
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>
  components?: { schemas?: Record<string, JsonSchemaObject> }
}

interface OperationEntry {
  path: string
  method: string
  operation: OpenApiOperation
}

interface ResolvedSchema {
  schema?: JsonSchemaObject
  pointer?: string
}

interface ComparisonScope {
  operationId: string
  snapshot: OpenApiDocument
  child: OpenApiDocument
  visited: Set<string>
}

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
])
const SCHEMA_POINTER_PREFIX = "#/components/schemas/"

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

function collectOperations(doc: OpenApiDocument): Map<string, OperationEntry> {
  const operations = new Map<string, OperationEntry>()
  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (HTTP_METHODS.has(method) && operation.operationId) {
        operations.set(routeKey(method, path), { path, method, operation })
      }
    }
  }
  return operations
}

function resolveSchema(
  schema: JsonSchemaObject | undefined,
  doc: OpenApiDocument
): ResolvedSchema {
  const followed = new Set<string>()
  let current = schema
  let pointer: string | undefined
  while (current?.$ref) {
    pointer = current.$ref
    if (followed.has(pointer) || !pointer.startsWith(SCHEMA_POINTER_PREFIX)) {
      return { pointer }
    }
    followed.add(pointer)
    current =
      doc.components?.schemas?.[pointer.slice(SCHEMA_POINTER_PREFIX.length)]
    if (!current) {
      return { pointer }
    }
  }
  return { schema: current, pointer }
}

function compareSchema(
  scope: ComparisonScope,
  field: string,
  snapshotSchema: JsonSchemaObject | undefined,
  childSchema: JsonSchemaObject | undefined
): void {
  const resolvedSnapshot = resolveSchema(snapshotSchema, scope.snapshot)
  if (!resolvedSnapshot.schema) {
    return
  }
  const resolvedChild = resolveSchema(childSchema, scope.child)

  if (resolvedSnapshot.pointer && resolvedChild.pointer) {
    const pair = `${resolvedSnapshot.pointer}::${resolvedChild.pointer}`
    if (scope.visited.has(pair)) {
      return
    }
    scope.visited.add(pair)
  }

  const pinned = resolvedSnapshot.schema
  const actual = resolvedChild.schema ?? {}

  if (pinned.type !== undefined && pinned.type !== actual.type) {
    throw new Error(
      `contract-snapshot: operação "${scope.operationId}" mudou o tipo do campo "${field}" de ` +
        `"${pinned.type}" para "${actual.type ?? "ausente"}"`
    )
  }

  const pinnedRequired = pinned.required ?? []
  const actualRequired = actual.required ?? []
  for (const name of pinnedRequired) {
    if (!actualRequired.includes(name)) {
      throw new Error(
        `contract-snapshot: operação "${scope.operationId}" perdeu o campo obrigatório ` +
          `"${field}.${name}"`
      )
    }
  }
  for (const name of actualRequired) {
    if (!pinnedRequired.includes(name)) {
      throw new Error(
        `contract-snapshot: operação "${scope.operationId}" mudou o campo obrigatório ` +
          `"${field}.${name}"`
      )
    }
  }

  for (const [name, pinnedProperty] of Object.entries(
    pinned.properties ?? {}
  )) {
    const actualProperty = actual.properties?.[name]
    if (actualProperty) {
      compareSchema(scope, `${field}.${name}`, pinnedProperty, actualProperty)
    }
  }
  if (pinned.items && actual.items) {
    compareSchema(scope, `${field}[]`, pinned.items, actual.items)
  }
}

function compareOperation(
  scope: ComparisonScope,
  pinned: OpenApiOperation,
  actual: OpenApiOperation
): void {
  for (const [mediaType, media] of Object.entries(
    pinned.requestBody?.content ?? {}
  )) {
    compareSchema(
      scope,
      "requestBody",
      media.schema,
      actual.requestBody?.content?.[mediaType]?.schema
    )
  }
  for (const [status, response] of Object.entries(pinned.responses ?? {})) {
    for (const [mediaType, media] of Object.entries(response.content ?? {})) {
      compareSchema(
        scope,
        `responses.${status}`,
        media.schema,
        actual.responses?.[status]?.content?.[mediaType]?.schema
      )
    }
  }
}

/**
 * Confere que o `openapi.json` do child ainda honra tudo que o `snapshot` da entry
 * fixa: cada rota (método + caminho) continua existindo com o mesmo `operationId`,
 * com os mesmos campos obrigatórios e com os mesmos tipos. Os `$ref` são resolvidos
 * nos dois lados contra o `components.schemas` do próprio documento, de forma
 * simétrica; um `$ref` que não resolve no snapshot não fixa nada. A asserção é de
 * subconjunto: o child pode acrescentar rotas e campos opcionais.
 */
export function expectContractSubset(
  openapiPath: string,
  snapshot: OpenApiDocument
): void {
  const child = JSON.parse(
    readFileSync(openapiPath, "utf-8")
  ) as OpenApiDocument
  const childOperations = collectOperations(child)

  for (const [route, pinned] of collectOperations(snapshot)) {
    const operationId = pinned.operation.operationId ?? ""
    const actual = childOperations.get(route)
    if (!actual) {
      throw new Error(
        `contract-snapshot: operação "${operationId}" (${route}) ausente no openapi do child`
      )
    }
    if (actual.operation.operationId !== operationId) {
      throw new Error(
        `contract-snapshot: rota "${route}" mudou o operationId de "${operationId}" para ` +
          `"${actual.operation.operationId ?? "ausente"}"`
      )
    }

    compareOperation(
      { operationId, snapshot, child, visited: new Set<string>() },
      pinned.operation,
      actual.operation
    )
  }
}
