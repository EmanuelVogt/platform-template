import "reflect-metadata"

import { join, relative } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import { ACCESS_REQUIREMENT } from "../shared/kernel/access/decorators"
import { endsWith, listFilePaths } from "../shared/test/unit/source-survey"

// Constants do Nest fora do exports map — mesma razão do operation-id.spec.ts.
const PATH_METADATA = "path"
const METHOD_METADATA = "method"

const SRC_DIR = join(__dirname, "..")

type RouteAccess = {
  file: string
  controller: string
  handler: string
  declared: boolean
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

function declaresAccess(handler: object, controller: object): boolean {
  return (
    Reflect.getMetadata(ACCESS_REQUIREMENT, handler) !== undefined ||
    Reflect.getMetadata(ACCESS_REQUIREMENT, controller) !== undefined
  )
}

async function collectRoutes(): Promise<RouteAccess[]> {
  const routes: RouteAccess[] = []
  for (const file of findControllerFiles()) {
    const mod = (await import(file)) as Record<string, unknown>
    for (const exported of Object.values(mod)) {
      if (!isControllerClass(exported)) continue
      const proto = exported.prototype as Record<string, unknown>
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue
        const handler = proto[name]
        if (typeof handler !== "function") continue
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue
        routes.push({
          file: relative(SRC_DIR, file),
          controller: exported.name,
          handler: name,
          declared: declaresAccess(handler, exported),
        })
      }
    }
  }
  return routes
}

describe("authz-coverage — toda rota declara o requisito de acesso do kernel", () => {
  let routes: RouteAccess[] = []

  beforeAll(async () => {
    routes = await collectRoutes()
  })

  it("varredura encontra rotas (sanidade do glob)", () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it("nenhuma rota sem declaração (@Public | @Authenticated | @RequirePermission | @RequireAnyPermission)", () => {
    const undeclared = routes.filter((r) => !r.declared)
    expect(undeclared).toEqual([])
  })
})
