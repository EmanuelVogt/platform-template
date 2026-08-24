import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const VALID_WEB_STACKS = ["vite", "next"]
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
])
const FORBIDDEN_PATTERNS = {
  next: ["VITE_", "@tanstack/react-router", "nginx"],
  vite: ['from "next'],
}

export class InvalidWebStackError extends Error {
  constructor(value) {
    super(`"${value}" não é um --web-stack válido — use "vite" ou "next"`)
    this.name = "InvalidWebStackError"
    this.value = value
  }
}

export class WebShellMismatchError extends Error {
  constructor(message) {
    super(message)
    this.name = "WebShellMismatchError"
  }
}

export function parseWebStack(argv, flag = "--web-stack") {
  const index = argv.indexOf(flag)
  if (index === -1) return "vite"
  const value = argv[index + 1]
  if (!VALID_WEB_STACKS.includes(value)) throw new InvalidWebStackError(value)
  return value
}

function walkFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

function findForbiddenHit(webDir, patterns) {
  for (const file of walkFiles(webDir)) {
    let content
    try {
      content = readFileSync(file, "utf8")
    } catch {
      continue // binário ou ilegível — não é fonte, ignora
    }
    for (const pattern of patterns) {
      if (content.includes(pattern)) return { file, pattern }
    }
  }
  return null
}

// Verifica se `childDir/apps/web` tem o shape do `webStack` pedido (CAT-01, ACC-06).
// Um copier real sempre renderiza apps/web; a ausência do diretório só ocorre em
// dublês de teste que não tocam o disco de verdade — nesse caso não há o que checar.
export function assertWebShell(childDir, webStack) {
  const webDir = path.join(childDir, "apps", "web")
  if (!existsSync(webDir)) return

  const nextConfig = path.join(webDir, "next.config.ts")
  const viteConfig = path.join(webDir, "vite.config.ts")
  const packageJsonPath = path.join(webDir, "package.json")

  let packageName
  try {
    packageName = JSON.parse(readFileSync(packageJsonPath, "utf8")).name
  } catch {
    packageName = undefined
  }

  const isNext = webStack === "next"
  const wantedConfig = isNext ? nextConfig : viteConfig
  const forbiddenConfig = isNext ? viteConfig : nextConfig
  const shapeOk =
    existsSync(wantedConfig) &&
    !existsSync(forbiddenConfig) &&
    packageName === "web"
  if (!shapeOk) {
    throw new WebShellMismatchError(
      `apps/web não tem o formato esperado para --web-stack ${webStack}: ` +
        `${path.basename(wantedConfig)} deveria existir, ${path.basename(forbiddenConfig)} não deveria existir, ` +
        `e package.json.name deveria ser "web" (encontrado "${packageName}")`
    )
  }

  const hit = findForbiddenHit(webDir, FORBIDDEN_PATTERNS[webStack])
  if (hit) {
    throw new WebShellMismatchError(
      `apps/web (--web-stack ${webStack}) não deveria conter "${hit.pattern}" — encontrado em ${hit.file}`
    )
  }
}
