import { readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"

export type SourceFile = { rel: string; path: string; content: string }

export type ImportStatement = { line: number; clause: string; specifier: string }

const IMPORT_STATEMENT =
  /\b(?:import|export)\s+([^"';]*?)\s*from\s*["']([^"']+)["']/g

export function toPosix(value: string): string {
  return value.split(sep).join("/")
}

export function listDirectories(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

export function listFiles(
  root: string,
  matches: (rel: string) => boolean
): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map(toPosix)
    .filter(matches)
}

export function listFilePaths(
  root: string,
  matches: (rel: string) => boolean
): string[] {
  return listFiles(root, matches).map((rel) => join(root, rel))
}

export function readFiles(
  root: string,
  matches: (rel: string) => boolean
): SourceFile[] {
  return listFiles(root, matches).map((rel) => {
    const path = join(root, rel)
    return { rel, path, content: readFileSync(path, "utf8") }
  })
}

export function endsWith(suffix: string): (rel: string) => boolean {
  return (rel) => rel.endsWith(suffix)
}

export function isProductionSource(rel: string): boolean {
  return (
    rel.endsWith(".ts") &&
    !rel.endsWith(".spec.ts") &&
    !rel.endsWith(".int-spec.ts") &&
    !rel.endsWith(".e2e-spec.ts") &&
    !rel.includes("/testing/")
  )
}

export function parseImports(content: string): ImportStatement[] {
  const statements: ImportStatement[] = []
  for (const match of content.matchAll(IMPORT_STATEMENT)) {
    statements.push({
      line: content.slice(0, match.index).split("\n").length,
      clause: match[1] ?? "",
      specifier: match[2] ?? "",
    })
  }
  return statements
}
