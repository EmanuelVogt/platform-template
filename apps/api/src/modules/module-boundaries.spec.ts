import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, resolve, sep } from "node:path"

const MODULES_DIR = __dirname
const KERNEL_PREFIX = resolve(MODULES_DIR, "..", "shared", "kernel") + sep

const ROOT_CONNECTION = resolve(
  MODULES_DIR,
  "..",
  "shared",
  "infra",
  "database",
  "drizzle.provider.ts"
)
const ROOT_CONNECTION_TEXT =
  /(?:^|\/)shared\/infra\/database\/drizzle\.provider(?:\.[jt]s)?$/
const EXECUTOR_TYPE = "DrizzleExecutor"

const LAYERS = new Set(["api", "application", "domain", "infrastructure"])

// Travessias cross-module autorizadas, par a par, com o motivo:
// - registry de renderers (ADR 0067): scheduling registra o renderer no report
//   e implementa o port dele — inversão deliberada; 3º renderer promove o port
//   ao kernel.
// - contrato HTTP compartilhado: 3 controllers reusam o contract de access-log
//   do attachment e o reservation reusa um schema do scheduling. Endereço
//   definitivo (kernel × dono) ainda sem decisão — a trava congela o estoque.
const CROSS_MODULE_ALLOWLIST = new Set<string>([])

// Exceções same-module, com o motivo:
// - upload-attachments.controller → multipart-files: o parser consome o
//   Request cru na borda HTTP; o tipo que chega ao use case (IncomingFile)
//   mora no domain — port aqui seria cerimônia sem isolar nada.
// - sse.controller → sse-connection-registry: o controller liga a conexão
//   HTTP viva ao registry em memória do próprio módulo, sem use case no meio;
//   um port de domínio exigiria tipos de rxjs/Nest no domain (viola a Regra 4).
// - upload-profiles → attachment.config: só o TIPO da config atravessa — o
//   catálogo de perfis deriva dos limites da env e a função segue pura.
const SAME_MODULE_ALLOWLIST = new Set([
  "attachment/api/controllers/upload-attachments.controller.ts -> attachment/infrastructure/http/multipart-files.ts",
  "notification/api/controllers/stream/sse.controller.ts -> notification/infrastructure/realtime/sse-connection-registry.ts",
  "attachment/domain/upload-profiles.ts -> attachment/attachment.config.ts",
  // Decisão B4(b) do T8: as duas tabelas de profissional continuam no schema pg
  // `identity` e são expostas a modules/professional por esta facade — reexportar
  // a tabela é impossível sem atravessar api → infrastructure.
  "identity/api/facades/professional-tables.facade.ts -> identity/infrastructure/tables/professional-default-hours.table.ts",
  // Mesma decisão B4(b): a segunda tabela de profissional sai pela mesma facade.
  "identity/api/facades/professional-tables.facade.ts -> identity/infrastructure/tables/user-professional-schedule-config.table.ts",
])

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
// por spec (fakes do scheduling, fixtures do engine) — regra de camada governa
// código de runtime, não suporte de teste.
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
      name: part.replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim() ?? "",
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
      inModules &&
      pair.includes(` -> ${edge.importerModule}/domain/`)
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
  const edges = collectEdges()

  it("varredura encontra imports (sanidade)", () => {
    expect(edges.length).toBeGreaterThan(100)
  })

  it("nenhuma travessia proibida fora das allowlists", () => {
    const offenders = edges
      .map(violationOf)
      .filter((v): v is string => v !== null)
    expect([...new Set(offenders)].sort()).toEqual([])
  })

  it("api/events/ é superfície pública como api/facades/; application/events/ não é (KPB-05)", () => {
    const legal: Edge = {
      importer: "identity/application/use-cases/x.use-case.ts",
      target: toPosix(
        resolve(MODULES_DIR, "notification/api/events/notification-requested.event.ts")
      ),
      importerModule: "identity",
      importerLayer: "application",
    }
    const illegal: Edge = {
      importer: "identity/application/use-cases/x.use-case.ts",
      target: toPosix(
        resolve(
          MODULES_DIR,
          "notification/application/events/notification-requested.event.ts"
        )
      ),
      importerModule: "identity",
      importerLayer: "application",
    }
    expect(violationOf(legal)).toBeNull()
    expect(violationOf(illegal)).not.toBeNull()
  })

  it("allowlist cross-module sem entrada morta", () => {
    const pairs = new Set(
      edges
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
  const FAKE_REL = "guest/infrastructure/repositories/drizzle-fake.repository.ts"
  const FAKE_ABS = resolve(MODULES_DIR, FAKE_REL)
  const RELATIVE = "../../../../shared/infra/database/drizzle.provider"

  const offensesOf = (source: string): string[] =>
    rootConnectionOffenses(FAKE_REL, FAKE_ABS, source)

  it("o caminho relativo do fixture resolve no drizzle.provider real", () => {
    expect(resolveTarget(FAKE_ABS, RELATIVE)).toBe(ROOT_CONNECTION)
  })

  it("a varredura de produção visita quem importa a conexão raiz (sanidade)", () => {
    const importers = productionFiles().filter((rel) => {
      const abs = resolve(MODULES_DIR, rel)
      return importStatementsIn(readFileSync(abs, "utf8")).some((statement) =>
        pointsToRootConnection(abs, statement.specifier)
      )
    })
    expect(importers.length).toBeGreaterThan(10)
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
    expect(offensesOf(`import type { DrizzleExecutor } from "${RELATIVE}"`))
      .toEqual([])
    expect(offensesOf(`import { type DrizzleExecutor } from '${RELATIVE}'`))
      .toEqual([])
  })

  it("reprova DrizzleExecutor importado como valor", () => {
    expect(offensesOf(`import { DrizzleExecutor } from "${RELATIVE}"`)).toEqual([
      `módulo importa a conexão raiz: ${FAKE_REL}:1 — DrizzleExecutor`,
    ])
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
    expect(offensesOf(`import { DRIZZLE } from "./drizzle-fake.helper"`))
      .toEqual([])
  })
})

// RULE A (design C-GUARD-API): o kernel não conhece produto — nenhum arquivo de
// produção em shared/** importa modules/**. `import type` conta como import: o
// tipo de produto some na compilação, mas a dependência de design fica.
const SHARED_DIR = resolve(MODULES_DIR, "..", "shared")
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

// RULE B (design C-GUARD-API): o base set é o kernel de produto — enxerga
// shared/**, o próprio módulo e apenas a superfície pública (api/facades/ |
// api/events/) de outro módulo do base set. Import para módulo fora do base set
// é violação em qualquer camada, inclusive .module.ts. Entrar nesta lista é
// decisão de design, nunca conserto de teste vermelho.
const BASE_SET_MODULES = new Set([
  "identity",
  "audit",
  "attachment",
  "tag",
  "notification",
])

// SPEC_DEVIATION: o design C-GUARD-API lista só api/facades/ | api/events/ como
// superfície pública; aqui o .module.ts raiz de OUTRO módulo do base set também
// passa.
// Reason: `imports: [IdentityModule]` é a fiação DI do Nest, não pode ser
// reendereçada, já é travessia legal na tabela cross-module deste arquivo e não
// vaza produto — as 3 arestas reais (attachment/audit → identity, identity →
// attachment) ficam dentro do base set. Módulo fora do base set continua
// proibido, .module.ts inclusive.
const BASE_SET_WIRING = /^[^/]+\/[^/]+\.module\.ts$/

function isPublicSurface(targetRel: string): boolean {
  return targetRel.includes("/api/facades/") || targetRel.includes("/api/events/")
}

function baseSetViolationOf(edge: Edge): string | null {
  if (!BASE_SET_MODULES.has(edge.importerModule)) return null
  const modulesPrefix = toPosix(MODULES_DIR) + "/"
  if (!edge.target.startsWith(modulesPrefix)) return null

  const targetRel = edge.target.slice(modulesPrefix.length)
  const targetModule = targetRel.split("/")[0] ?? ""
  if (targetModule === edge.importerModule) return null
  if (
    BASE_SET_MODULES.has(targetModule) &&
    (isPublicSurface(targetRel) || BASE_SET_WIRING.test(targetRel))
  )
    return null

  const reason = BASE_SET_MODULES.has(targetModule)
    ? "base set fora da superfície pública"
    : "base set importa módulo de produto"
  return `${reason}: ${edge.importer} -> ${targetRel}`
}

describe("module-boundaries — RULE A: shared/** nunca importa modules/**", () => {
  const FAKE_REL = "infra/fake-kernel-consumer.ts"
  const FAKE_ABS = resolve(SHARED_DIR, FAKE_REL)
  const RELATIVE = "../../modules/identity/identity.module"

  const offensesOf = (source: string): string[] =>
    sharedOffenses(FAKE_REL, FAKE_ABS, source)

  it("o caminho relativo do fixture resolve num arquivo real de modules", () => {
    expect(resolveTarget(FAKE_ABS, RELATIVE)).toBe(
      resolve(MODULES_DIR, "identity/identity.module.ts")
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
    expect(offensesOf(`import { IdentityModule } from "${RELATIVE}"`)).toEqual([
      `shared importa modules: ${FAKE_REL} -> identity/identity.module.ts`,
    ])
  })

  it("reprova import type — o tipo de produto também é dependência", () => {
    expect(
      offensesOf(`import type { IdentityModule } from "${RELATIVE}"`)
    ).toEqual([
      `shared importa modules: ${FAKE_REL} -> identity/identity.module.ts`,
    ])
  })

  it("reprova specifier não-relativo para src/modules", () => {
    expect(
      offensesOf(`import { X } from "src/modules/audit/api/facades/y.facade"`)
    ).toEqual([
      `shared importa modules: ${FAKE_REL} -> src/modules/audit/api/facades/y.facade`,
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

describe("module-boundaries — RULE B: base set não enxerga produto", () => {
  const edgeTo = (target: string): Edge => ({
    importer: "identity/application/use-cases/x.use-case.ts",
    target: toPosix(resolve(MODULES_DIR, target)),
    importerModule: "identity",
    importerLayer: "application",
  })

  it("os módulos do base set existem no disco (sanidade)", () => {
    const onDisk = new Set(productionFiles().map((rel) => rel.split("/")[0]))
    expect([...BASE_SET_MODULES].filter((m) => !onDisk.has(m))).toEqual([])
  })

  it("nenhum módulo do base set importa fora do base set", () => {
    const offenders = collectEdges()
      .map(baseSetViolationOf)
      .filter((v): v is string => v !== null)
    expect([...new Set(offenders)].sort()).toEqual([])
  })

  it("reprova módulo de produto em qualquer camada, inclusive facade e .module", () => {
    const offenders = [
      "scheduling/api/facades/guest-agenda.facade.ts",
      "professional/professional.module.ts",
      "service/domain/service.entity.ts",
    ].map((target) => baseSetViolationOf(edgeTo(target)))
    expect(offenders).toEqual([
      "base set importa módulo de produto: identity/application/use-cases/x.use-case.ts -> scheduling/api/facades/guest-agenda.facade.ts",
      "base set importa módulo de produto: identity/application/use-cases/x.use-case.ts -> professional/professional.module.ts",
      "base set importa módulo de produto: identity/application/use-cases/x.use-case.ts -> service/domain/service.entity.ts",
    ])
  })

  it("reprova outro módulo do base set fora da superfície pública", () => {
    expect(
      baseSetViolationOf(edgeTo("audit/application/record-activity.use-case.ts"))
    ).toBe(
      "base set fora da superfície pública: identity/application/use-cases/x.use-case.ts -> audit/application/record-activity.use-case.ts"
    )
  })

  it("aceita a fiação DI entre módulos do base set, não a de produto", () => {
    expect(
      baseSetViolationOf(edgeTo("attachment/attachment.module.ts"))
    ).toBeNull()
    expect(
      baseSetViolationOf(edgeTo("attachment/api/attachment-extra.module.ts"))
    ).not.toBeNull()
  })

  it("aceita superfície pública do base set, internals e shared", () => {
    expect(
      baseSetViolationOf(edgeTo("notification/api/events/requested.event.ts"))
    ).toBeNull()
    expect(
      baseSetViolationOf(edgeTo("audit/api/facades/audit-trail.facade.ts"))
    ).toBeNull()
    expect(
      baseSetViolationOf(edgeTo("identity/infrastructure/tables/users.table.ts"))
    ).toBeNull()
    expect(
      baseSetViolationOf({
        importer: "identity/application/use-cases/x.use-case.ts",
        target: toPosix(resolve(SHARED_DIR, "kernel/entity.ts")),
        importerModule: "identity",
        importerLayer: "application",
      })
    ).toBeNull()
  })

  it("não julga módulo fora do base set", () => {
    expect(
      baseSetViolationOf({
        importer: "scheduling/application/x.use-case.ts",
        target: toPosix(resolve(MODULES_DIR, "service/domain/service.entity.ts")),
        importerModule: "scheduling",
        importerLayer: "application",
      })
    ).toBeNull()
  })
})
