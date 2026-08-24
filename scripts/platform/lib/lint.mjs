import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import semver from "semver"
import { AdvisoryParseError, parseAdvisory } from "./frontmatter.mjs"
import { ManifestValidationError, validateManifest } from "./manifest.mjs"
import { stableTagsFromLsRemote } from "./template-version.mjs"
// `entryChangedWithoutBump` mora em release-preflight.mjs, não aqui: este
// arquivo está em `_exclude` (copier.yml) e release-preflight.mjs não —
// a direção inversa quebraria o import no filho (excluded-imports.test.mjs).
import { entryChangedWithoutBump } from "../release-preflight.mjs"

export { discoverEntries } from "./entries.mjs"

const WEB_CORE_ALLOWED = ["zod", "@platform/api-client"]
const WEB_REACT_ALLOWED = [...WEB_CORE_ALLOWED, "@tanstack/react-query"]
const WEB_CORE_TEST_EXTRA = ["vitest"]
const WEB_REACT_TEST_EXTRA = [...WEB_CORE_TEST_EXTRA, "@testing-library/react"]
const TEST_FILE_RE = /\.test\.tsx?$/
const IMPORT_RE = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g
const HEADING_RE = /^## .+$/gm
const CONTRACT_FENCE_RE = /```\n([\s\S]*?)```/
const API_TEST_SUFFIX_RE =
  /\.(spec|int-spec|e2e-spec|parity\.spec|fixture)\.ts$/
const API_TEST_DIR_RE = /(^|\/)(testing|__e2e__|parity)\//
const TESTING_SPECIFIER_RE = /\/testing\//

function isAllowedSpecifier(specifier, allowed) {
  if (specifier.startsWith(".")) return true
  return allowed.some(
    (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`)
  )
}

function importsFrom(source) {
  const specifiers = []
  const re = new RegExp(IMPORT_RE)
  let match
  while ((match = re.exec(source))) {
    specifiers.push(match[1])
  }
  return specifiers
}

export function extractContractHeadings(contractMarkdown) {
  const fence = CONTRACT_FENCE_RE.exec(contractMarkdown)
  if (!fence) return []
  return fence[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

// Posicional: a ordem das seções importa tanto quanto o texto exato.
export function lintReadmeHeadings(readmeMarkdown, expectedHeadings) {
  const found = [...readmeMarkdown.matchAll(HEADING_RE)].map((m) => m[0].trim())
  const errors = []
  expectedHeadings.forEach((heading, index) => {
    if (found[index] !== heading) {
      errors.push(
        `seção esperada "${heading}" na posição ${index + 1}, encontrado "${found[index] ?? "(ausente)"}"`
      )
    }
  })
  return errors
}

// Formato keep-a-changelog: heading `## [<version>]`.
export function lintChangelogVersion(changelogMarkdown, version) {
  const heading = `## [${version}]`
  return changelogMarkdown.includes(heading)
    ? []
    : [`sem heading para a versão ${version} (esperado "${heading}")`]
}

// Allow-list de AD-018: web/core é TS puro, web/react soma react-query — nunca router/UI.
// *.test.ts(x) soma vitest (e, em web/react, @testing-library/react para renderHook); o resto da lista continua proibido.
export function lintWebImports(files) {
  const errors = []
  for (const { path: filePath, content, layer } of files) {
    const isReact = layer === "react"
    const base = isReact ? WEB_REACT_ALLOWED : WEB_CORE_ALLOWED
    const allowed = TEST_FILE_RE.test(filePath)
      ? [...base, ...(isReact ? WEB_REACT_TEST_EXTRA : WEB_CORE_TEST_EXTRA)]
      : base
    for (const specifier of importsFrom(content)) {
      if (!isAllowedSpecifier(specifier, allowed)) {
        errors.push(
          `${filePath}: import não permitido em web/${layer}: ${specifier}`
        )
      }
    }
  }
  return errors
}

function walkTsFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkTsFiles(full))
    } else if (entry.name.endsWith(".ts")) {
      out.push(full)
    }
  }
  return out
}

// AD-023/AD-031: testing/, __e2e__/ e parity/ ficam fora do build (nest-cli.json,
// tsconfig.build.json) — código de produção que importa de lá quebra em runtime.
export function lintProductionTestingImports(entryDir) {
  const apiDir = path.join(entryDir, "api")
  const errors = []
  for (const filePath of walkTsFiles(apiDir)) {
    const relativeToApi = path
      .relative(apiDir, filePath)
      .split(path.sep)
      .join("/")
    if (
      API_TEST_SUFFIX_RE.test(relativeToApi) ||
      API_TEST_DIR_RE.test(relativeToApi)
    )
      continue
    for (const specifier of importsFrom(readFileSync(filePath, "utf8"))) {
      if (TESTING_SPECIFIER_RE.test(specifier)) {
        errors.push(
          `${filePath}: código de produção importa de testing/: ${specifier}`
        )
      }
    }
  }
  return errors
}

export function lintManifest(manifest) {
  try {
    validateManifest(manifest)
    return []
  } catch (err) {
    if (err instanceof ManifestValidationError) return err.errors
    throw err
  }
}

// A versão mais recente do changelog é a que catalog:check simula e a que a próxima tag
// carrega (AD-006): um range que a exclui só aparece no child, como exit 8 (issue #9).
export function lintKernelRange(manifest, kernelVersion) {
  if (!manifest.kernelRange || !semver.validRange(manifest.kernelRange))
    return []
  if (semver.satisfies(kernelVersion, manifest.kernelRange)) return []
  return [
    `kernelRange "${manifest.kernelRange}" não aceita o kernel ${kernelVersion} (versão mais recente de docs/dev/template-changelog.md) — nenhum child nessa versão consegue instalar a entrada; abra o range junto com o bump`,
  ]
}

export function lintAdvisoryFrontmatter(content, filePath) {
  try {
    parseAdvisory(content, filePath)
    return []
  } catch (err) {
    if (err instanceof AdvisoryParseError) return [err.message]
    throw err
  }
}

export function lintAdvisoryModule(advisory, entryNames) {
  if (advisory.module === "kernel" || entryNames.includes(advisory.module))
    return []
  return [
    `module "${advisory.module}" não é "kernel" nem uma entrada existente do catálogo (${advisory.id})`,
  ]
}

const CATALOG_PATH_TOKEN_RE = /(^|\s)(catalog\/\S+)/g

function catalogPathsIn(text) {
  const found = []
  const re = new RegExp(CATALOG_PATH_TOKEN_RE)
  let match
  while ((match = re.exec(text))) found.push(match[2])
  return found
}

// CAT-04: `detect`/`parity` rodam contra a árvore do filho, onde `copier.yml`
// exclui `catalog/` inteiro (:30) — um caminho começando por essa árvore
// nunca casa lá, mesmo quando casa em dev dentro do template.
export function lintAdvisoryPathScope(advisory) {
  const errors = []
  for (const field of ["detect", "parity"]) {
    for (const badPath of catalogPathsIn(advisory[field] ?? "")) {
      errors.push(
        `${field} referencia "${badPath}", que começa com "catalog/" — copier.yml exclui essa árvore do filho; use o caminho de layout do filho (apps/api/src/modules/<entrada>, ou .../__parity__/<arquivo> para parity) (${advisory.id})`
      )
    }
  }
  return errors
}

// CAT-02: catalog:lint precisa de uma falha alta e distinta quando não há
// linha de base — ao contrário do preflight, que pula o guard em silêncio
// (a release ainda não tem tags para comparar). Um clone raso sem
// `fetch-depth: 0` (T35) é o caso real que isso precisa nomear, nunca deixar
// passar quieto.
export function resolveBaseline({ repoRoot, exec }) {
  const result = exec(
    "git",
    ["ls-remote", "--tags", "--refs", repoRoot, "v*"],
    { cwd: repoRoot }
  )
  if (result.status !== 0) {
    return {
      unavailable: `"git ls-remote" falhou em ${repoRoot} (status ${result.status}) — path fora de um repositório git?`,
    }
  }
  const tag = stableTagsFromLsRemote(result.stdout ?? "").at(-1)
  if (!tag) {
    return {
      unavailable: `nenhuma tag estável "v*" alcançável a partir de ${repoRoot} — clone raso sem fetch-depth: 0 (T35) ou repositório sem tags?`,
    }
  }
  return { tag }
}

export function lintEntryBump({ repoRoot, exec, entries }) {
  const baseline = resolveBaseline({ repoRoot, exec })
  if (baseline.unavailable) return [`lintEntryBump: ${baseline.unavailable}`]
  const errors = []
  for (const entryDir of entries) {
    if (
      entryChangedWithoutBump({
        repoRoot,
        exec,
        previousTag: baseline.tag,
        entryDir,
      })
    ) {
      const relDir = path.relative(repoRoot, entryDir)
      errors.push(
        `${relDir}: mudou desde ${baseline.tag} sem bump de versão em module.json`
      )
    }
  }
  return errors
}
