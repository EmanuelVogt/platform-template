import { readFileSync } from "node:fs"
import semver from "semver"

// SPEC_DEVIATION: validação escrita à mão espelhando catalog/schema/module.schema.json, sem lib de JSON Schema (ex.: ajv)
// Reason: payload da task T5 autoriza essa troca para não adicionar dependência de runtime além de semver/yaml
const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  "name",
  "variant",
  "version",
  "description",
  "kernelRange",
  "dependsOn",
  "apiModule",
  "schemaExports",
  "customMigrations",
  "env",
  "web",
  "absorbs",
])

const REQUIRED_TOP_LEVEL_FIELDS = ["name", "version", "kernelRange"]

export class ManifestValidationError extends Error {
  constructor(errors) {
    super(`module.json inválido: ${errors.join("; ")}`)
    this.name = "ManifestValidationError"
    this.errors = errors
  }
}

function validateDependsOn(dependsOn, errors) {
  if (!Array.isArray(dependsOn)) {
    errors.push("dependsOn deve ser um array")
    return
  }
  dependsOn.forEach((dep, index) => {
    if (dep === null || typeof dep !== "object" || !dep.name || !dep.range) {
      errors.push(`dependsOn[${index}] deve ter name e range`)
      return
    }
    if (!semver.validRange(dep.range)) {
      errors.push(`dependsOn[${index}].range inválido: ${dep.range}`)
    }
  })
}

export function validateManifest(manifest) {
  const errors = []

  if (
    manifest === null ||
    typeof manifest !== "object" ||
    Array.isArray(manifest)
  ) {
    throw new ManifestValidationError(["module.json deve ser um objeto"])
  }

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (manifest[field] === undefined) {
      errors.push(`campo obrigatório ausente: ${field}`)
    }
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      errors.push(`campo desconhecido: ${key}`)
    }
  }

  if (manifest.version !== undefined && !semver.valid(manifest.version)) {
    errors.push(`version inválida (semver esperado): ${manifest.version}`)
  }

  if (
    manifest.kernelRange !== undefined &&
    !semver.validRange(manifest.kernelRange)
  ) {
    errors.push(`kernelRange inválido: ${manifest.kernelRange}`)
  }

  if (manifest.dependsOn !== undefined) {
    validateDependsOn(manifest.dependsOn, errors)
  }

  if (errors.length > 0) {
    throw new ManifestValidationError(errors)
  }

  return manifest
}

export function readManifest(filePath) {
  const raw = readFileSync(filePath, "utf8")
  const manifest = JSON.parse(raw)
  return validateManifest(manifest)
}
