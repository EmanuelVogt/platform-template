import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { expandGitShorthand } from "../catalog-source.mjs"
import { EXIT_CODES } from "../exit-codes.mjs"
import { readLock } from "../lock.mjs"
import { readTemplateOrigin } from "../template-version.mjs"

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const TYPES = new Set(["bug", "improvement"])
const BASE_AREAS = new Set([
  "kernel-api",
  "kernel-web",
  "harness",
  "docs",
  "ci-infra",
])
const CATALOG_AREA_RE = /^catalog\/[a-z][a-z0-9-]*$/
const MAX_TITLE = 120
const MAX_URL = 7500

// Espelho da tabela de ownership de docs/dev/template.md: só o que é da plataforma
// pode subir como issue; o código de negócio do produto nunca sai do repositório.
const PLATFORM_PREFIXES = [
  "apps/api/src/shared/",
  "apps/api/test/",
  "apps/web/src/app/",
  "apps/web/src/shared/",
  "packages/",
  "scripts/",
  ".claude/",
  ".agents/",
  ".github/",
  "docs/",
]
const PLATFORM_FILES = new Set([
  "AGENTS.md",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
  "docker-compose.yml",
  "turbo.json",
  "lefthook.yml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vitest.config.mts",
  "vitest.coverage.mts",
  "vitest.integration.mts",
])
const PRODUCT_PREFIXES = [".ca-plans/", ".specs/"]
const KERNEL_MIGRATION_RE = /^apps\/api\/drizzle\/migrations\/\d{4}_kernel_/
const MODULE_PATH_RE =
  /^apps\/(?:api\/src\/modules|web\/src\/entities)\/([^/]+)\//

const SECRET_PATTERNS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "chave privada" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, label: "token GitHub" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, label: "token Slack" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./, label: "JWT" },
  {
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i,
    label: "URL com credencial embutida",
  },
  {
    re: /\b(?:senha|password|secret|token|api[_-]?key)\b\s*[:=]\s*["'][^"']{6,}/i,
    label: "atribuição de segredo",
  },
]

export function classifyPath(rawPath, lockModules) {
  const clean = rawPath.replace(/^\.\//, "")
  if (PRODUCT_PREFIXES.some((prefix) => clean.startsWith(prefix))) {
    return { ok: false, reason: "decisões e specs são do produto" }
  }
  if (clean === "README.md") {
    return { ok: false, reason: "o README é do produto" }
  }
  if (clean.startsWith("apps/api/drizzle/migrations/")) {
    if (KERNEL_MIGRATION_RE.test(clean)) return { ok: true }
    return {
      ok: false,
      reason: "migração do produto (só NNNN_kernel_* é da plataforma)",
    }
  }
  if (
    PLATFORM_PREFIXES.some((prefix) => clean.startsWith(prefix)) ||
    PLATFORM_FILES.has(clean)
  ) {
    return { ok: true }
  }
  const moduleMatch = MODULE_PATH_RE.exec(clean)
  if (moduleMatch) {
    if (lockModules.has(moduleMatch[1]))
      return { ok: true, entry: moduleMatch[1] }
    return {
      ok: false,
      reason: "módulo de negócio do produto (fora do .platform-modules.lock)",
    }
  }
  return { ok: false, reason: "fora dos caminhos da plataforma" }
}

export function parseDraft(md, { lockModules }) {
  const match = FRONTMATTER_RE.exec(md)
  if (!match)
    return { problems: ["frontmatter YAML ausente (title/type/area/paths)"] }

  let frontmatter
  try {
    frontmatter = parseYaml(match[1])
  } catch (err) {
    return { problems: [`frontmatter ilegível: ${err.message}`] }
  }
  if (
    frontmatter === null ||
    typeof frontmatter !== "object" ||
    Array.isArray(frontmatter)
  ) {
    return { problems: ["frontmatter deve ser um objeto"] }
  }

  const problems = []
  const title =
    typeof frontmatter.title === "string" ? frontmatter.title.trim() : ""
  if (!title) problems.push("campo obrigatório ausente: title")
  else if (title.length > MAX_TITLE)
    problems.push(`title acima de ${MAX_TITLE} caracteres`)

  if (!TYPES.has(frontmatter.type)) {
    problems.push(
      `type inválido: ${frontmatter.type ?? "(nenhum)"} — use bug|improvement`
    )
  }

  const area = typeof frontmatter.area === "string" ? frontmatter.area : ""
  if (!BASE_AREAS.has(area) && !CATALOG_AREA_RE.test(area)) {
    problems.push(
      `area inválida: ${area || "(nenhuma)"} — use kernel-api|kernel-web|harness|docs|ci-infra|catalog/<entry>`
    )
  } else if (
    area.startsWith("catalog/") &&
    !lockModules.has(area.slice("catalog/".length))
  ) {
    problems.push(
      `area ${area}: entrada não instalada neste produto (.platform-modules.lock)`
    )
  }

  const paths = Array.isArray(frontmatter.paths)
    ? frontmatter.paths.filter((p) => typeof p === "string" && p.trim() !== "")
    : []
  if (paths.length === 0)
    problems.push("paths vazio — aponte os arquivos da plataforma afetados")
  for (const p of paths) {
    const verdict = classifyPath(p, lockModules)
    if (!verdict.ok)
      problems.push(
        `caminho fora do escopo da plataforma: ${p} — ${verdict.reason}`
      )
  }

  const body = match[2].trim()
  if (!body)
    problems.push("corpo vazio — seções What / Evidence / Suggested fix")

  return {
    draft: { title, type: frontmatter.type, area, paths, body },
    problems,
  }
}

export function scanSecrets(md) {
  const hits = []
  md.split(/\r?\n/).forEach((line, index) => {
    for (const { re, label } of SECRET_PATTERNS) {
      if (re.test(line)) {
        hits.push({ line: index + 1, label })
        break
      }
    }
  })
  return hits
}

export function composeIssue({ draft, origin, modules }) {
  const footer = [
    "---",
    "- reported from a generated product via `pnpm platform feedback`",
    `- template: ${origin?.source ?? "(unknown)"}${origin?.commit ? ` — installed \`${origin.commit}\`` : ""}`,
    `- area: ${draft.area}`,
    `- paths: ${draft.paths.map((p) => `\`${p}\``).join(", ")}`,
  ]
  if (modules.length > 0) {
    footer.push(
      `- modules: ${modules.map((m) => `${m.name}@${m.version}`).join(", ")}`
    )
  }
  return `${draft.body}\n\n${footer.join("\n")}\n`
}

export function githubRepoOf(source) {
  if (typeof source !== "string") return undefined
  const expanded = expandGitShorthand(source)
  const match =
    /^(?:https:\/\/|git@)github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(
      expanded
    )
  return match ? `${match[1]}/${match[2]}` : undefined
}

function buildIssueUrl(repo, title, body) {
  const url = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  return url.length > MAX_URL ? undefined : url
}

const shellQuote = (value) => `'${value.replace(/'/g, "'\\''")}'`

const USAGE = `uso: pnpm platform feedback <rascunho.md> [--json]
fluxo guiado (skill platform-feedback): o agente rascunha .platform-feedback/<slug>.md com
frontmatter title/type/area/paths e seções What/Evidence/Suggested fix; este comando valida o
escopo (só caminhos da plataforma), procura segredos, carimba as versões instaladas e imprime
o comando gh + a URL pré-preenchida — abrir a issue é sempre um ato do usuário.
`

export async function feedbackCommand({
  draftPath,
  options = {},
  cwd = process.cwd(),
}) {
  if (!draftPath) {
    process.stderr.write(USAGE)
    return EXIT_CODES.USAGE_ERROR
  }

  const answersPath = path.join(cwd, ".copier-answers.yml")
  if (!existsSync(answersPath) && existsSync(path.join(cwd, "TEMPLATE.md"))) {
    process.stderr.write(
      "você está no repositório do template — corrija aqui direto (PR + tag); o fluxo de feedback é para produtos gerados.\n"
    )
    return EXIT_CODES.USAGE_ERROR
  }

  const absDraft = path.resolve(cwd, draftPath)
  if (!existsSync(absDraft)) {
    process.stderr.write(`rascunho não encontrado: ${draftPath}\n${USAGE}`)
    return EXIT_CODES.USAGE_ERROR
  }

  const raw = readFileSync(absDraft, "utf8")
  const lock = readLock(path.join(cwd, ".platform-modules.lock"))
  const modules = Object.entries(lock.modules ?? {}).map(([name, entry]) => ({
    name,
    version: entry.version,
  }))
  const lockModules = new Set(modules.map((m) => m.name))

  const { draft, problems } = parseDraft(raw, { lockModules })
  const secrets = scanSecrets(raw)
  if (problems.length > 0 || secrets.length > 0) {
    for (const problem of problems)
      process.stderr.write(`bloqueado: ${problem}\n`)
    for (const hit of secrets) {
      process.stderr.write(
        `bloqueado: possível segredo na linha ${hit.line} (${hit.label}) — redija e rode de novo\n`
      )
    }
    return EXIT_CODES.FEEDBACK_BLOCKED
  }

  const origin = readTemplateOrigin(answersPath)
  const body = composeIssue({ draft, origin, modules })
  const outFile = absDraft.replace(/\.md$/, "") + ".issue.md"
  writeFileSync(outFile, body, "utf8")
  const relOut = path.relative(cwd, outFile)

  const repo = origin ? githubRepoOf(origin.source) : undefined
  const ghCommand = repo
    ? `gh issue create --repo ${repo} --title ${shellQuote(draft.title)} --body-file ${shellQuote(relOut)}`
    : undefined
  const url = repo ? buildIssueUrl(repo, draft.title, body) : undefined

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          title: draft.title,
          area: draft.area,
          paths: draft.paths,
          template: origin ?? null,
          modules,
          repo: repo ?? null,
          ghCommand: ghCommand ?? null,
          url: url ?? null,
          outFile: relOut,
        },
        null,
        2
      )}\n`
    )
    return EXIT_CODES.OK
  }

  const lines = [
    `rascunho validado: ${draft.paths.length} caminho(s) da plataforma, nenhum segredo detectado`,
    `corpo da issue: ${relOut}`,
    "",
  ]
  if (!origin) {
    lines.push(
      "origem do template desconhecida (.copier-answers.yml ausente ou sem _src_path) — abra a issue no upstream com o corpo acima"
    )
  } else if (!repo) {
    lines.push(
      `origem sem repositório GitHub reconhecível (${origin.source}) — abra a issue no upstream correspondente com o corpo acima`
    )
  } else {
    lines.push(
      "com o OK do usuário, abra a issue no upstream:",
      `  ${ghCommand}`
    )
    lines.push(
      ...(url
        ? ["ou no navegador (título e corpo já preenchidos):", `  ${url}`]
        : [
            "(corpo longo demais para URL pré-preenchida — use o comando gh acima)",
          ])
    )
  }
  process.stdout.write(`${lines.join("\n")}\n`)
  return EXIT_CODES.OK
}
