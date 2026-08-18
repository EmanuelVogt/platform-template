import "reflect-metadata"

import { readdirSync } from "node:fs"
import { join, relative } from "node:path"

import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
  IS_SELF_SERVICE_KEY,
  REQUIRE_ANY_PERMISSION_KEY,
  REQUIRE_PERMISSION_KEY,
} from "../shared/kernel/access/decorators"

// Constants do Nest fora do exports map — mesma razão do operation-id.spec.ts.
const PATH_METADATA = "path"
const METHOD_METADATA = "method"

const ACCESS_KEYS = [
  IS_PUBLIC_KEY,
  IS_SELF_SERVICE_KEY,
  IS_OPTIONAL_AUTH_KEY,
  REQUIRE_PERMISSION_KEY,
  REQUIRE_ANY_PERMISSION_KEY,
] as const

const SRC_DIR = join(__dirname, "..")

type RouteAccess = {
  file: string
  controller: string
  handler: string
  declarations: string[]
}

function findControllerFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".controller.ts"))
    .map((entry) => join(SRC_DIR, entry))
}

function isControllerClass(value: unknown): value is new () => object {
  return (
    typeof value === "function" &&
    Reflect.getMetadata(PATH_METADATA, value) !== undefined
  )
}

function declarationsOf(handler: object, controller: object): string[] {
  return ACCESS_KEYS.filter(
    (key) =>
      Reflect.getMetadata(key, handler) !== undefined ||
      Reflect.getMetadata(key, controller) !== undefined
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
          declarations: declarationsOf(handler, exported),
        })
      }
    }
  }
  return routes
}

describe("authz-coverage — toda rota declara exatamente um modo de acesso", () => {
  let routes: RouteAccess[] = []

  beforeAll(async () => {
    routes = await collectRoutes()
  })

  it("varredura encontra rotas (sanidade do glob)", () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it("nenhuma rota sem declaração (@Public | @SelfService | @OptionalAuth | @RequirePermission)", () => {
    const undeclared = routes.filter((r) => r.declarations.length === 0)
    expect(undeclared).toEqual([])
  })

  it("nenhuma rota com declaração dupla", () => {
    const duplicated = routes.filter((r) => r.declarations.length > 1)
    expect(duplicated).toEqual([])
  })
})
