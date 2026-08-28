import path from "node:path"
import semver from "semver"
import { expandGitShorthand, splitCatalogRef } from "./catalog-source.mjs"
import { parseSemverTag } from "./template-version.mjs"

// Este vocabulário nasceu em `lib/lint.mjs` e desceu para cá porque lint.mjs
// está em `_exclude` (copier.yml) e `commands/add.mjs` não: enquanto morasse lá,
// o único consumidor possível era o próprio template (`excluded-imports.test.mjs`).
// Mesmo movimento de `discoverEntries` (entries.mjs) e `entryChangedWithoutBump`
// (release-preflight.mjs); lint.mjs re-exporta.

export const ENTRY_TAG_PREFIX = "catalog/"
const ENTRY_TAG_REF_PREFIX = `refs/tags/${ENTRY_TAG_PREFIX}`

// O segmento de variant é obrigatório quando `module.json` declara `variant` e
// proibido quando não declara (AD-040) — não é estilo: AD-013 define variant
// como implementação *alternativa do mesmo módulo*, então duas árvores
// reivindicariam `catalog/<name>@x.y.z`, e uma tag publicada não se renomeia sem
// quebrar quem já resolveu. O colchete é opcional no padrão, nunca na entrada.
export function entryTagSlug({ name, variant }) {
  return variant ? `${name}-${variant}` : name
}

export function entryTagName({ name, variant, version }) {
  return `${ENTRY_TAG_PREFIX}${entryTagSlug({ name, variant })}@${version}`
}

// O `@` é o separador: `catalog/identity@3.0.0` e
// `catalog/identity-single-tenant@3.0.0` são slugs distintos, e é exatamente
// essa distinção que a regra do variant existe para preservar.
export function entryTagsFromLsRemote(output) {
  const bySlug = new Map()
  for (const line of output.split("\n")) {
    const ref = line.split("\t").at(-1)?.trim()
    if (!ref?.startsWith(ENTRY_TAG_REF_PREFIX)) continue
    const rest = ref.slice(ENTRY_TAG_REF_PREFIX.length)
    const at = rest.lastIndexOf("@")
    if (at === -1) continue
    const slug = rest.slice(0, at)
    const version = rest.slice(at + 1)
    if (!slug || !semver.valid(version)) continue
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), version])
  }
  for (const [slug, versions] of bySlug) bySlug.set(slug, semver.sort(versions))
  return bySlug
}

// `undefined` (falhou em perguntar) não é o mesmo que Map vazio (perguntou, não
// há tag): quem chama decide coisas diferentes nos dois casos.
export function readEntryTags({ remote, cwd, exec, timeoutMs = 8000 }) {
  const result = exec(
    "git",
    ["ls-remote", "--tags", "--refs", remote, `${ENTRY_TAG_PREFIX}*`],
    {
      ...(cwd ? { cwd } : {}),
      timeout: timeoutMs,
      // Sem isto, um template privado sem credencial no ambiente trava a
      // instalação num prompt de senha em vez de falhar.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }
  )
  if (result.status !== 0) return undefined
  return entryTagsFromLsRemote(result.stdout ?? "")
}

// A tag mora no repositório do template, nunca no clone que `resolveCatalog`
// deixou em cache: aquele clone é `--depth 1 --branch <ref>` e carrega só as tags
// que apontam para o único commit buscado — acerta quando a tag da entrada ancora
// na release instalada e erra quando ancora numa anterior, que é o caso comum
// (AD-040). Não confiável é pior que vazio. Para uma fonte git o alvo é a URL
// expandida; para uma local, `catalog.root` é `<template>/catalog` e o repositório
// é o pai.
export function entryTagRemote(catalog) {
  const { source } = splitCatalogRef(catalog.ref)
  return catalog.kind === "git"
    ? expandGitShorthand(source)
    : path.dirname(path.resolve(catalog.root))
}

// A tag é exigida exatamente quando a instalação vem de uma release — a outra
// ponta da regra que o template já aplica em si mesmo: `lintEntryTagCoverage`
// obriga uma tag para toda versão de entrada que um `vX.Y.Z` entrega (AD-040).
// Faltar ali significa que o catálogo não é o que a release publicou. Antes da
// release nenhuma tag é esperada, e é isso que mantém instalável um catálogo de
// branch ou de checkout local — inclusive o do próprio gate pré-tag, que
// renderiza um filho e instala as entradas a partir da árvore de trabalho.
export function entryTagRequired(catalog) {
  if (catalog.kind !== "git") return false
  const { gitRef } = splitCatalogRef(catalog.ref)
  return Boolean(gitRef && parseSemverTag(gitRef))
}
