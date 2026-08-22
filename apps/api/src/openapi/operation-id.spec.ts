import "reflect-metadata"

import { join, relative } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import { endsWith, listFilePaths } from "../shared/test/unit/source-survey"

// Valores de PATH_METADATA/METHOD_METADATA (@nestjs/common) e do metadata key
// do @ApiOperation (@nestjs/swagger) — constants fora do exports map dos
// pacotes, mesma razão do API_OPERATION_METADATA em openapi-config.ts.
const PATH_METADATA = "path"
const METHOD_METADATA = "method"
const API_OPERATION_METADATA = "swagger/apiOperation"
const API_EXCLUDE_ENDPOINT_METADATA = "swagger/apiExcludeEndpoint"
const API_EXCLUDE_CONTROLLER_METADATA = "swagger/apiExcludeController"

const OPERATION_ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/

const SRC_DIR = join(__dirname, "..")

type RouteOperation = {
  file: string
  controller: string
  handler: string
  operationId: string | undefined
}

function findControllerFiles(): string[] {
  return listFilePaths(SRC_DIR, endsWith(".controller.ts"))
}

function isControllerClass(value: unknown): value is new () => object {
  return (
    typeof value === "function" &&
    Reflect.getMetadata(PATH_METADATA, value) !== undefined
  )
}

async function collectRouteOperations(): Promise<RouteOperation[]> {
  const routes: RouteOperation[] = []
  for (const file of findControllerFiles()) {
    const mod = (await import(file)) as Record<string, unknown>
    for (const exported of Object.values(mod)) {
      if (!isControllerClass(exported)) continue
      if (Reflect.getMetadata(API_EXCLUDE_CONTROLLER_METADATA, exported)) {
        continue
      }
      const proto = exported.prototype as Record<string, unknown>
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue
        const handler = proto[name]
        if (typeof handler !== "function") continue
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
          continue
        }
        if (Reflect.getMetadata(API_EXCLUDE_ENDPOINT_METADATA, handler)) {
          continue
        }
        const operation = Reflect.getMetadata(
          API_OPERATION_METADATA,
          handler
        ) as { operationId?: string } | undefined
        routes.push({
          file: relative(SRC_DIR, file),
          controller: exported.name,
          handler: name,
          operationId: operation?.operationId,
        })
      }
    }
  }
  return routes
}

describe("operationId — invariantes do contrato", () => {
  let routes: RouteOperation[] = []

  beforeAll(async () => {
    routes = await collectRouteOperations()
  })

  it("varredura encontra rotas (sanidade do glob)", () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it("toda rota declara operationId explícito via @ApiOperation", () => {
    const missing = routes.filter((route) => !route.operationId)
    expect(missing).toEqual([])
  })

  it("operationId é camelCase de ação, sem prefixo de controller nem versão", () => {
    const invalid = routes.filter(
      (route) =>
        route.operationId !== undefined &&
        !OPERATION_ID_PATTERN.test(route.operationId)
    )
    expect(invalid).toEqual([])
  })

  it("operationId é único no documento", () => {
    const byId = new Map<string, RouteOperation[]>()
    for (const route of routes) {
      if (route.operationId === undefined) continue
      byId.set(route.operationId, [
        ...(byId.get(route.operationId) ?? []),
        route,
      ])
    }
    const duplicated = [...byId.values()].filter((group) => group.length > 1)
    expect(duplicated).toEqual([])
  })
})
