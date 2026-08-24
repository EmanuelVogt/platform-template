import { parse as parseYaml } from "yaml"
import semver from "semver"

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const REQUIRED_FIELDS = [
  "id",
  "kind",
  "module",
  "affects",
  "severity",
  "detect",
  "fix",
  "parity",
]
const ALLOWED_KINDS = new Set(["bug", "security", "breaking"])
const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"])

export class AdvisoryParseError extends Error {
  constructor(filePath, detail) {
    super(`advisory inválido em ${filePath}: ${detail}`)
    this.name = "AdvisoryParseError"
    this.filePath = filePath
  }
}

export function parseAdvisory(md, filePath = "<advisory>") {
  const match = FRONTMATTER_RE.exec(md)
  if (!match) {
    throw new AdvisoryParseError(filePath, "frontmatter YAML ausente")
  }

  const frontmatter = parseYaml(match[1])
  if (
    frontmatter === null ||
    typeof frontmatter !== "object" ||
    Array.isArray(frontmatter)
  ) {
    throw new AdvisoryParseError(filePath, "frontmatter deve ser um objeto")
  }

  for (const field of REQUIRED_FIELDS) {
    const value = frontmatter[field]
    if (value === undefined || value === null || value === "") {
      throw new AdvisoryParseError(
        filePath,
        `campo obrigatório ausente: ${field}`
      )
    }
  }

  if (!ALLOWED_KINDS.has(frontmatter.kind)) {
    throw new AdvisoryParseError(filePath, `kind inválido: ${frontmatter.kind}`)
  }

  if (!ALLOWED_SEVERITIES.has(frontmatter.severity)) {
    throw new AdvisoryParseError(
      filePath,
      `severity inválido: ${frontmatter.severity}`
    )
  }

  if (!semver.validRange(frontmatter.affects)) {
    throw new AdvisoryParseError(
      filePath,
      `affects inválido (semver range esperado): ${frontmatter.affects}`
    )
  }

  return {
    id: frontmatter.id,
    kind: frontmatter.kind,
    module: frontmatter.module,
    affects: frontmatter.affects,
    severity: frontmatter.severity,
    detect: frontmatter.detect,
    fix: frontmatter.fix,
    parity: frontmatter.parity,
    body: match[2].trim(),
  }
}
