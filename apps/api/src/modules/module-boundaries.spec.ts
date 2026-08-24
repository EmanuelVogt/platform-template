import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve, sep } from "node:path"

import { describe, expect, it } from "vitest"

const MODULES_DIR = __dirname
const SRC_DIR = resolve(MODULES_DIR, "..")
const SHARED_DIR = resolve(SRC_DIR, "shared")
const KERNEL_PREFIX = resolve(SRC_DIR, "shared", "kernel") + sep

const ROOT_CONNECTION = resolve(
  SRC_DIR,
  "shared",
  "infra",
  "database",
  "drizzle.provider.ts"
)
const ROOT_CONNECTION_TEXT =
  /(?:^|\/)shared\/infra\/database\/drizzle\.provider(?:\.[jt]s)?$/
const EXECUTOR_TYPE = "DrizzleExecutor"

const LAYERS = new Set(["api", "application", "domain", "infrastructure"])

// Travessias cross-module autorizadas, par a par, com o motivo. Entrar nesta
// lista é decisão de design, nunca conserto de teste vermelho.
const CROSS_MODULE_ALLOWLIST = new Set<string>([])

// Exceções same-module, com o motivo.
const SAME_MODULE_ALLOWLIST = new Set<string>([])

type Edge = {
  importer: string
  target: string
  importerModule: string
  importerLayer: string
}

function toPosix(path: string): string {
  return path.split(sep).join("/")
}

// Pastas testing/ na árvore de produção guardam dublê/harness consumido só
// por spec (fakes, fixtures) — regra de camada governa código de runtime, não
// suporte de teste.
function isProductionFile(entry: string): boolean {
  return (
    entry.endsWith(".ts") &&
    !entry.endsWith(".spec.ts") &&
    !entry.endsWith(".int-spec.ts") &&
    !entry.endsWith(".e2e-spec.ts") &&
    !entry.includes("/testing/")
  )
}

function resolveTarget(importerAbs: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null
  const base = resolve(dirname(importerAbs), specifier)
  if (existsSync(`${base}.ts`)) return `${base}.ts`
  if (existsSync(resolve(base, "index.ts"))) return resolve(base, "index.ts")
  return null
}

type ImportStatement = {
  line: number
  clause: string
  specifier: string
}

const IMPORT_STATEMENT =
  /\b(?:import|export)\s+([^"';]*?)\s*from\s*["']([^"']+)["']/g

function importStatementsIn(source: string): ImportStatement[] {
  const statements: ImportStatement[] = []
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    statements.push({
      line: source.slice(0, match.index).split("\n").length,
      clause: match[1] ?? "",
      specifier: match[2] ?? "",
    })
  }
  return statements
}

type Binding = {
  name: string
  typeOnly: boolean
}

function bindingsIn(clause: string): Binding[] {
  const trimmed = clause.trim()
  const typeOnlyStatement = /^type\b/.test(trimmed)
  const body = (typeOnlyStatement ? trimmed.slice("type".length) : trimmed)
    .replace(/[{}]/g, ",")
    .split(",")
  return body
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => ({
      name:
        part
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
          ?.trim() ?? "",
      typeOnly: typeOnlyStatement || /^type\s/.test(part),
    }))
}

function pointsToRootConnection(
  importerAbs: string,
  specifier: string
): boolean {
  return (
    resolveTarget(importerAbs, specifier) === ROOT_CONNECTION ||
    ROOT_CONNECTION_TEXT.test(specifier)
  )
}

// Só `DrizzleExecutor` type-only escapa: é o tipo que `getExecutor()` devolve e
// o `import type` some na compilação. Qualquer binding de valor (DRIZZLE,
// PG_POOL) cria aresta de runtime para o módulo que abre o pool — a causa do
// deadlock. Sem allowlist: nenhum módulo tem motivo para a conexão raiz.
function rootConnectionOffenses(
  rel: string,
  importerAbs: string,
  source: string
): string[] {
  const offenses: string[] = []
  for (const statement of importStatementsIn(source)) {
    if (!pointsToRootConnection(importerAbs, statement.specifier)) continue
    const refused = bindingsIn(statement.clause).filter(
      (binding) => !(binding.typeOnly && binding.name === EXECUTOR_TYPE)
    )
    if (refused.length === 0) continue
    offenses.push(
      `módulo importa a conexão raiz: ${rel}:${statement.line} — ${refused
        .map((binding) => binding.name)
        .join(", ")}`
    )
  }
  return offenses
}

function layerOf(relPath: string): string {
  const segment = relPath.split("/")[1] ?? ""
  return LAYERS.has(segment) ? segment : "root"
}

function productionFilesIn(dir: string): string[] {
  return readdirSync(dir, {
    recursive: true,
    encoding: "utf8",
  })
    .map(toPosix)
    .filter(isProductionFile)
}

function productionFiles(): string[] {
  return productionFilesIn(MODULES_DIR)
}

function collectEdges(): Edge[] {
  const edges: Edge[] = []
  for (const rel of productionFiles()) {
    const abs = resolve(MODULES_DIR, rel)
    const source = readFileSync(abs, "utf8")
    for (const statement of importStatementsIn(source)) {
      const target = resolveTarget(abs, statement.specifier)
      if (!target) continue
      edges.push({
        importer: rel,
        target: toPosix(target),
        importerModule: rel.split("/")[0] ?? "",
        importerLayer: layerOf(rel),
      })
    }
  }
  return edges
}

function violationOf(edge: Edge): string | null {
  const targetAbs = edge.target
  const inModules = targetAbs.startsWith(toPosix(MODULES_DIR) + "/")
  const pair = inModules
    ? `${edge.importer} -> ${targetAbs.slice(toPosix(MODULES_DIR).length + 1)}`
    : `${edge.importer} -> ${targetAbs}`

  if (edge.importerLayer === "domain") {
    const sameDomain =
      inModules && pair.includes(` -> ${edge.importerModule}/domain/`)
    const kernel = targetAbs.startsWith(toPosix(KERNEL_PREFIX))
    if (sameDomain || kernel || SAME_MODULE_ALLOWLIST.has(pair)) return null
    return `domain importa fora de domain/kernel: ${pair}`
  }

  if (!inModules) return null

  const targetRel = targetAbs.slice(toPosix(MODULES_DIR).length + 1)
  const targetModule = targetRel.split("/")[0] ?? ""

  if (targetModule === edge.importerModule) {
    if (SAME_MODULE_ALLOWLIST.has(pair)) return null
    const targetLayer = layerOf(targetRel)
    if (
      edge.importerLayer === "application" &&
      targetLayer === "infrastructure" &&
      !targetRel.includes("/infrastructure/events/")
    ) {
      return `application → infrastructure: ${pair}`
    }
    if (
      edge.importerLayer === "infrastructure" &&
      (targetLayer === "application" || targetLayer === "api")
    ) {
      return `infrastructure → ${targetLayer}: ${pair}`
    }
    if (edge.importerLayer === "api" && targetLayer === "infrastructure") {
      return `api → infrastructure: ${pair}`
    }
    return null
  }

  if (targetRel.includes("/api/facades/") || targetRel.includes("/api/events/"))
    return null
  if (targetRel.endsWith(".module.ts")) return null
  if (CROSS_MODULE_ALLOWLIST.has(pair)) return null
  return `cross-module fora de api/facades: ${pair}`
}

describe("module-boundaries — import entre camadas e módulos segue a tabela do handbook", () => {
  it("nenhuma travessia proibida fora das allowlists", () => {
    const offenders = collectEdges()
      .map(violationOf)
      .filter((v): v is string => v !== null)
    expect([...new Set(offenders)].sort()).toEqual([])
  })

  it("reprova application → infrastructure do próprio módulo", () => {
    expect(
      violationOf({
        importer: "agenda/application/x.use-case.ts",
        target: toPosix(
          resolve(
            MODULES_DIR,
            "agenda/infrastructure/repositories/y.repository.ts"
          )
        ),
        importerModule: "agenda",
        importerLayer: "application",
      })
    ).toBe(
      "application → infrastructure: agenda/application/x.use-case.ts -> agenda/infrastructure/repositories/y.repository.ts"
    )
  })

  it("reprova domain importando fora de domain/kernel", () => {
    expect(
      violationOf({
        importer: "agenda/domain/x.entity.ts",
        target: toPosix(
          resolve(MODULES_DIR, "agenda/application/y.use-case.ts")
        ),
        importerModule: "agenda",
        importerLayer: "domain",
      })
    ).toBe(
      "domain importa fora de domain/kernel: agenda/domain/x.entity.ts -> agenda/application/y.use-case.ts"
    )
  })

  it("aceita domain importando kernel", () => {
    expect(
      violationOf({
        importer: "agenda/domain/x.entity.ts",
        target: toPosix(resolve(KERNEL_PREFIX, "entity.ts")),
        importerModule: "agenda",
        importerLayer: "domain",
      })
    ).toBeNull()
  })

  it("api/events/ é superfície pública como api/facades/; application/events/ não é (KPB-05)", () => {
    const legal: Edge = {
      importer: "agenda/application/use-cases/x.use-case.ts",
      target: toPosix(
        resolve(MODULES_DIR, "billing/api/events/invoice-issued.event.ts")
      ),
      importerModule: "agenda",
      importerLayer: "application",
    }
    const illegal: Edge = {
      importer: "agenda/application/use-cases/x.use-case.ts",
      target: toPosix(
        resolve(
          MODULES_DIR,
          "billing/application/events/invoice-issued.event.ts"
        )
      ),
      importerModule: "agenda",
      importerLayer: "application",
    }
    expect(violationOf(legal)).toBeNull()
    expect(violationOf(illegal)).not.toBeNull()
  })

  it("allowlist cross-module sem entrada morta", () => {
    const pairs = new Set(
      collectEdges()
        .filter((e) => e.target.startsWith(toPosix(MODULES_DIR) + "/"))
        .map(
          (e) =>
            `${e.importer} -> ${e.target.slice(toPosix(MODULES_DIR).length + 1)}`
        )
    )
    const stale = [...CROSS_MODULE_ALLOWLIST].filter((p) => !pairs.has(p))
    expect(stale).toEqual([])
  })
})

describe("module-boundaries — varredura de import", () => {
  it("enxerga aspas simples, aspas duplas e specifier não-relativo", () => {
    const source = [
      `import { A } from "./a"`,
      `import { B } from '../b'`,
      `import { C } from "src/shared/c"`,
      `export type { D } from "@workspace/d"`,
    ].join("\n")
    expect(importStatementsIn(source).map((s) => s.specifier)).toEqual([
      "./a",
      "../b",
      "src/shared/c",
      "@workspace/d",
    ])
  })

  it("enxerga import multi-linha e reporta a linha de abertura", () => {
    const source = ["", "import {", "  A,", "  B,", "} from './ab'"].join("\n")
    expect(importStatementsIn(source)).toEqual([
      { line: 2, clause: "{\n  A,\n  B,\n}", specifier: "./ab" },
    ])
  })

  it("separa binding type-only de binding de valor", () => {
    expect(bindingsIn("type { A, B }")).toEqual([
      { name: "A", typeOnly: true },
      { name: "B", typeOnly: true },
    ])
    expect(bindingsIn("{ A, type B as C }")).toEqual([
      { name: "A", typeOnly: false },
      { name: "B", typeOnly: true },
    ])
    expect(bindingsIn("* as db")).toEqual([{ name: "*", typeOnly: false }])
  })
})

describe("module-boundaries — nenhum módulo enxerga a conexão raiz do banco", () => {
  const FAKE_REL =
    "guest/infrastructure/repositories/drizzle-fake.repository.ts"
  const FAKE_ABS = resolve(MODULES_DIR, FAKE_REL)
  const RELATIVE = "../../../../shared/infra/database/drizzle.provider"

  const offensesOf = (source: string): string[] =>
    rootConnectionOffenses(FAKE_REL, FAKE_ABS, source)

  it("o caminho relativo do fixture resolve no drizzle.provider real", () => {
    expect(resolveTarget(FAKE_ABS, RELATIVE)).toBe(ROOT_CONNECTION)
  })

  it("nenhum arquivo de produção em src/modules importa a conexão raiz", () => {
    const offenders = productionFiles().flatMap((rel) => {
      const abs = resolve(MODULES_DIR, rel)
      return rootConnectionOffenses(rel, abs, readFileSync(abs, "utf8"))
    })
    expect(offenders.sort()).toEqual([])
  })

  it("reprova DRIZZLE nomeando arquivo e linha", () => {
    expect(offensesOf(`import { DRIZZLE } from "${RELATIVE}"`)).toEqual([
      `módulo importa a conexão raiz: ${FAKE_REL}:1 — DRIZZLE`,
    ])
  })

  it("reprova PG_POOL, DrizzleDb, DrizzleTx e DrizzleSchema", () => {
    for (const name of ["PG_POOL", "DrizzleDb", "DrizzleTx", "DrizzleSchema"]) {
      expect(offensesOf(`import type { ${name} } from "${RELATIVE}"`)).toEqual([
        `módulo importa a conexão raiz: ${FAKE_REL}:1 — ${name}`,
      ])
    }
  })

  it("aceita DrizzleExecutor type-only, no statement ou inline", () => {
    expect(
      offensesOf(`import type { DrizzleExecutor } from "${RELATIVE}"`)
    ).toEqual([])
    expect(
      offensesOf(`import { type DrizzleExecutor } from '${RELATIVE}'`)
    ).toEqual([])
  })

  it("reprova DrizzleExecutor importado como valor", () => {
    expect(offensesOf(`import { DrizzleExecutor } from "${RELATIVE}"`)).toEqual(
      [`módulo importa a conexão raiz: ${FAKE_REL}:1 — DrizzleExecutor`]
    )
  })

  it("reprova specifier não-relativo, que a varredura antiga não via", () => {
    const source = `import { DRIZZLE } from "src/shared/infra/database/drizzle.provider"`
    expect([...source.matchAll(/from "(\.[^"]+)"/g)]).toEqual([])
    expect(offensesOf(source)).toEqual([
      `módulo importa a conexão raiz: ${FAKE_REL}:1 — DRIZZLE`,
    ])
  })

  it("reprova import multi-linha que mistura valor e tipo", () => {
    const source = [
      `import {`,
      `  DRIZZLE,`,
      `  type DrizzleExecutor,`,
      `} from "${RELATIVE}"`,
    ].join("\n")
    expect(offensesOf(source)).toEqual([
      `módulo importa a conexão raiz: ${FAKE_REL}:1 — DRIZZLE`,
    ])
  })

  it("reprova só os bindings proibidos quando DrizzleExecutor vem junto", () => {
    const source = `import type { DrizzleDb, DrizzleExecutor } from "${RELATIVE}"`
    expect(offensesOf(source)).toEqual([
      `módulo importa a conexão raiz: ${FAKE_REL}:1 — DrizzleDb`,
    ])
  })

  it("não confunde import de outro alvo com a conexão raiz", () => {
    expect(
      offensesOf(`import { DRIZZLE } from "./drizzle-fake.helper"`)
    ).toEqual([])
  })
})

// RULE A (design C-GUARD-API): o kernel não conhece produto — nenhum arquivo de
// produção em shared/** importa modules/**. `import type` conta como import: o
// tipo de produto some na compilação, mas a dependência de design fica.
const MODULES_SPECIFIER = /(?:^|\/)src\/modules\//

function sharedOffenses(
  rel: string,
  importerAbs: string,
  source: string
): string[] {
  const modulesPrefix = toPosix(MODULES_DIR) + "/"
  const offenses: string[] = []
  for (const statement of importStatementsIn(source)) {
    const resolved = resolveTarget(importerAbs, statement.specifier)
    const target = resolved ? toPosix(resolved) : null
    if (target?.startsWith(modulesPrefix)) {
      offenses.push(
        `shared importa modules: ${rel} -> ${target.slice(modulesPrefix.length)}`
      )
      continue
    }
    if (
      !statement.specifier.startsWith(".") &&
      MODULES_SPECIFIER.test(statement.specifier)
    ) {
      offenses.push(`shared importa modules: ${rel} -> ${statement.specifier}`)
    }
  }
  return offenses
}

describe("module-boundaries — RULE A: shared/** nunca importa modules/**", () => {
  const FAKE_REL = "infra/fake-kernel-consumer.ts"
  const FAKE_ABS = resolve(SHARED_DIR, FAKE_REL)
  // Único alvo real sob modules/ num template kernel-only — serve de prova de
  // que o resolvedor de caminho relativo do guard ainda encontra a pasta.
  const RELATIVE = "../../modules/module-boundaries.spec"

  const offensesOf = (source: string): string[] =>
    sharedOffenses(FAKE_REL, FAKE_ABS, source)

  it("o caminho relativo do fixture resolve num arquivo real de modules", () => {
    expect(resolveTarget(FAKE_ABS, RELATIVE)).toBe(
      resolve(MODULES_DIR, "module-boundaries.spec.ts")
    )
  })

  it("a varredura enxerga os arquivos de produção de shared (sanidade)", () => {
    expect(productionFilesIn(SHARED_DIR).length).toBeGreaterThan(20)
  })

  it("nenhum arquivo de produção em src/shared importa src/modules", () => {
    const offenders = productionFilesIn(SHARED_DIR).flatMap((rel) => {
      const abs = resolve(SHARED_DIR, rel)
      return sharedOffenses(rel, abs, readFileSync(abs, "utf8"))
    })
    expect(offenders.sort()).toEqual([])
  })

  it("reprova import de valor nomeando file → target", () => {
    expect(offensesOf(`import { anything } from "${RELATIVE}"`)).toEqual([
      `shared importa modules: ${FAKE_REL} -> module-boundaries.spec.ts`,
    ])
  })

  it("reprova import type — o tipo de produto também é dependência", () => {
    expect(offensesOf(`import type { Anything } from "${RELATIVE}"`)).toEqual([
      `shared importa modules: ${FAKE_REL} -> module-boundaries.spec.ts`,
    ])
  })

  it("reprova specifier não-relativo para src/modules", () => {
    expect(
      offensesOf(`import { X } from "src/modules/agenda/api/facades/y.facade"`)
    ).toEqual([
      `shared importa modules: ${FAKE_REL} -> src/modules/agenda/api/facades/y.facade`,
    ])
  })

  it("não reprova import interno de shared nem pacote externo", () => {
    const source = [
      `import { Injectable } from "@nestjs/common"`,
      `import { LoggerFactory } from "../observability/logger.factory"`,
    ].join("\n")
    expect(offensesOf(source)).toEqual([])
  })
})

// RULE C (design § 2.4): o vocabulário do kernel não conhece módulo. Nenhum
// token de identity/attachment/audit/notification/tag sobrevive na casca do
// template — nem em código, nem em comentário, nem em string. Cada token some
// junto com a entrada que o define; reencontrá-lo aqui significa que a entrada
// vazou de volta pro kernel.
const FORBIDDEN_TOKENS: readonly { label: string; pattern: RegExp }[] = [
  { label: "identity", pattern: /identity/ },
  { label: "IdentityModule", pattern: /IdentityModule/ },
  { label: "accessProfile", pattern: /accessProfile/ },
  { label: "access_profile", pattern: /access_profile/ },
  { label: "AccessProfile", pattern: /AccessProfile/ },
  { label: "PermissionsGuard", pattern: /PermissionsGuard/ },
  { label: "permissionCatalog", pattern: /permissionCatalog/ },
  { label: "uploadProfile", pattern: /uploadProfile/ },
  { label: "UploadProfile", pattern: /UploadProfile/ },
  { label: "auditTrail", pattern: /auditTrail/ },
  { label: "audit_trail", pattern: /audit_trail/ },
  { label: "AuditRegistry", pattern: /AuditRegistry/ },
  { label: "NotificationModule", pattern: /NotificationModule/ },
  { label: "notification_", pattern: /notification_/ },
  { label: "TagModule", pattern: /TagModule/ },
  { label: "tag. (prefixo de schema)", pattern: /"?\btag"?\.[a-z_]/ },
]

// Casca web ativa: numa cópia renderizada só `apps/web` existe; no template
// só `apps/web-vite` (e, a partir do T7, também `apps/web-next`) — a varredura
// soma tudo que encontrar, nunca assume uma única casca fixa (RULE C, CAT-03).
const WEB_SHELL_NAMES = ["web", "web-vite", "web-next"] as const

function webShellRoots(): string[] {
  return WEB_SHELL_NAMES.map((name) =>
    resolve(SRC_DIR, "..", "..", name)
  ).filter((dir) => existsSync(dir))
}

// `app/` é a camada FSD na Vite shell; no Next `app/` é reservado pelo
// framework e a camada vira `_app/` com um re-export em `app/` — a varredura
// soma as duas, e `kernelSurfaceFiles()` já ignora a que não existir.
function webShellSurfaceRoots(): string[] {
  return webShellRoots().flatMap((shellRoot) => {
    const srcDir = resolve(shellRoot, "src")
    return [
      resolve(srcDir, "app"),
      resolve(srcDir, "_app"),
      resolve(srcDir, "shared"),
      resolve(srcDir, "pages"),
    ]
  })
}

const KERNEL_SURFACE: readonly string[] = [
  SHARED_DIR,
  resolve(SRC_DIR, "app.module.ts"),
  resolve(SRC_DIR, "db", "schema.ts"),
  resolve(SRC_DIR, "openapi"),
  resolve(SRC_DIR, "docs"),
  resolve(SRC_DIR, "..", "test"),
  ...webShellSurfaceRoots(),
]

// Um nome de módulo sobrevive em três lugares deliberados. (1) A fixture de
// teste: existe para simular a entrada que não está instalada. (2) O harness
// de truncamento (test-db.ts): precisa do schema de cada entry instalada para
// truncar suas tabelas entre testes; `identity.professional_default_hours`
// sai daqui só quando a fatia profissional deixa o entry (T72, IDENT-01,
// v3.0.0), não antes. (3) SPEC_DEVIATION: openapi-config.ts:29 nomeia a
// entrada `identity` na descrição OpenAPI publicada — T45 (BRAND-07) só
// alarga a varredura e não tem essa linha em `Touches`; T49 (BRAND-01,
// v3.0.0) é quem mexe nela. Reason: sem esta entrada o teste vermelho exigiria
// editar um arquivo fora do escopo de T45.
const TOKEN_ALLOWLIST =
  /(?:^|\/)shared\/test\/.*\.fixture\.ts$|(?:^|\/)apps\/api\/test\/setup\/test-db\.ts$|(?:^|\/)apps\/api\/src\/openapi\/openapi-config\.ts$/

function isScannedFile(path: string): boolean {
  return (
    (path.endsWith(".ts") || path.endsWith(".tsx")) &&
    !TOKEN_ALLOWLIST.test(toPosix(path))
  )
}

function kernelSurfaceFiles(): string[] {
  const files: string[] = []
  for (const root of KERNEL_SURFACE) {
    if (!existsSync(root)) continue
    if (statSync(root).isFile()) {
      files.push(root)
      continue
    }
    for (const entry of readdirSync(root, {
      recursive: true,
      encoding: "utf8",
    })) {
      const abs = resolve(root, entry)
      if (isScannedFile(abs) && statSync(abs).isFile()) files.push(abs)
    }
  }
  return files
}

function tokenOffensesIn(rel: string, source: string): string[] {
  const offenses: string[] = []
  const lines = source.split("\n")
  for (const [index, line] of lines.entries()) {
    for (const token of FORBIDDEN_TOKENS) {
      if (token.pattern.test(line)) {
        offenses.push(`${rel}:${index + 1} — ${token.label}`)
      }
    }
  }
  return offenses
}

describe("module-boundaries — RULE C: o vocabulário do kernel não conhece módulo", () => {
  it("a varredura enxerga a casca do template, api e web (sanidade)", () => {
    const files = kernelSurfaceFiles().map(toPosix)
    expect(files.length).toBeGreaterThan(50)
    expect(
      files.some((file) => /\/apps\/web(-vite|-next)?\/src\/_?app\//.test(file))
    ).toBe(true)
    expect(files.some((file) => file.includes("/apps/api/src/shared/"))).toBe(
      true
    )
    expect(files).toContain(toPosix(resolve(SRC_DIR, "app.module.ts")))
    expect(files).toContain(toPosix(resolve(SRC_DIR, "db", "schema.ts")))
  })

  it("webShellRoots() resolve só as cascas web existentes — template ou produto (CAT-03)", () => {
    const roots = webShellRoots().map(toPosix)
    const appsDir = resolve(SRC_DIR, "..", "..")
    const existing = ["web", "web-vite", "web-next"]
      .map((name) => resolve(appsDir, name))
      .filter((dir) => existsSync(dir))
      .map(toPosix)
    expect(existing.length).toBeGreaterThan(0)
    expect(roots).toEqual(existing)
  })

  it("KERNEL_SURFACE inclui src/app/** e src/_app/** de cada casca web", () => {
    for (const root of webShellRoots()) {
      expect(KERNEL_SURFACE).toContain(resolve(root, "src", "app"))
      expect(KERNEL_SURFACE).toContain(resolve(root, "src", "_app"))
    }
  })

  it("KERNEL_SURFACE inclui apps/api/test, src/openapi e src/docs (BRAND-07)", () => {
    expect(KERNEL_SURFACE).toContain(resolve(SRC_DIR, "openapi"))
    expect(KERNEL_SURFACE).toContain(resolve(SRC_DIR, "docs"))
    expect(KERNEL_SURFACE).toContain(resolve(SRC_DIR, "..", "test"))
  })

  it("KERNEL_SURFACE inclui src/pages de cada casca web (BRAND-07)", () => {
    for (const root of webShellRoots()) {
      expect(KERNEL_SURFACE).toContain(resolve(root, "src", "pages"))
    }
  })

  it("a varredura alcança de fato apps/api/test e apps/api/src/openapi", () => {
    const files = kernelSurfaceFiles().map(toPosix)
    expect(files).toContain(
      toPosix(resolve(SRC_DIR, "..", "test", "setup", "unit-env.ts"))
    )
    expect(files).toContain(
      toPosix(resolve(SRC_DIR, "..", "test", "setup", "e2e-env.ts"))
    )
    expect(
      files.some((file) =>
        file.endsWith("/apps/api/src/openapi/openapi-config.spec.ts")
      )
    ).toBe(true)
  })

  it("test-db.ts mantém identity.professional_default_hours (T72 apaga em v3.0.0), mas sai da varredura de token", () => {
    const testDbPath = resolve(SRC_DIR, "..", "test", "setup", "test-db.ts")
    expect(readFileSync(testDbPath, "utf8")).toMatch(
      /identity\.professional_default_hours/
    )
    expect(kernelSurfaceFiles().map(toPosix)).not.toContain(toPosix(testDbPath))
  })

  it("nenhum token de módulo sobrevive na casca do template", () => {
    const offenders = kernelSurfaceFiles().flatMap((abs) =>
      tokenOffensesIn(
        toPosix(abs).slice(
          toPosix(resolve(SRC_DIR, "..", "..", "..")).length + 1
        ),
        readFileSync(abs, "utf8")
      )
    )
    expect(offenders.sort()).toEqual([])
  })

  it("reprova cada token da lista, com arquivo e linha", () => {
    const source = [
      `import { IdentityModule } from "x"`,
      `const a = user.accessProfile`,
      `-- coluna access_profile`,
      `type T = AccessProfile`,
      `@UseGuards(PermissionsGuard)`,
      `const c = permissionCatalog`,
      `const u = uploadProfile`,
      `type U = UploadProfile`,
      `const t = auditTrail`,
      `select * from audit_trail`,
      `new AuditRegistry()`,
      `imports: [NotificationModule]`,
      `insert into notification_deliveries`,
      `imports: [TagModule]`,
      `select * from tag.tags`,
      `import "./identity.config"`,
    ].join("\n")
    expect(tokenOffensesIn("fake.ts", source)).toEqual([
      "fake.ts:1 — IdentityModule",
      "fake.ts:2 — accessProfile",
      "fake.ts:3 — access_profile",
      "fake.ts:4 — AccessProfile",
      "fake.ts:5 — PermissionsGuard",
      "fake.ts:6 — permissionCatalog",
      "fake.ts:7 — uploadProfile",
      "fake.ts:8 — UploadProfile",
      "fake.ts:9 — auditTrail",
      "fake.ts:10 — audit_trail",
      "fake.ts:11 — AuditRegistry",
      "fake.ts:12 — NotificationModule",
      "fake.ts:13 — notification_",
      "fake.ts:14 — TagModule",
      "fake.ts:15 — tag. (prefixo de schema)",
      "fake.ts:16 — identity",
    ])
  })

  it("é case-sensitive: `Identity` sozinho não casa com o token minúsculo", () => {
    expect(tokenOffensesIn("fake.ts", `const Identity = 1`)).toEqual([])
    expect(tokenOffensesIn("fake.ts", `const identity = 1`)).toEqual([
      "fake.ts:1 — identity",
    ])
  })

  it("não reprova palavra vizinha que só contém o token como prefixo alheio", () => {
    expect(tokenOffensesIn("fake.ts", `const tags = ["a"]`)).toEqual([])
    expect(tokenOffensesIn("fake.ts", `const notification = 1`)).toEqual([])
  })

  it("libera fixture de teste sob shared/test, não o resto", () => {
    expect(isScannedFile("/x/apps/api/src/shared/test/user.fixture.ts")).toBe(
      false
    )
    expect(isScannedFile("/x/apps/api/src/shared/test/render.ts")).toBe(true)
    expect(isScannedFile("/x/apps/api/src/shared/kernel/a.fixture.ts")).toBe(
      true
    )
  })
})
