import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

// Modelo estático do que o copier entrega a um filho. Mora em `lib/` porque o glob de
// `test:scripts` é raso (`__tests__/*.test.mjs`) e não coleta subdiretório — o mesmo
// motivo de `fixtures/`. Nada entra em `_exclude` por causa dele: `scripts/platform/__tests__`
// já é uma entrada de diretório.
//
// Regra que sustenta o resto da feature: o conjunto entregue é SEMPRE recalculado do
// `copier.yml` de verdade (AUD-08). Uma lista embutida num teste envelhece em silêncio.

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".."
)

export const readExcludes = () =>
  parseYaml(readFileSync(path.join(ROOT, "copier.yml"), "utf8"))._exclude ?? []

export const trackedFiles = () =>
  execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)

// `_exclude` é gitwildmatch (pathspec), não `String.includes`: uma barra inicial ou
// interna ancora na raiz, um nome puro casa o basename em qualquer profundidade, e casar
// um ancestral exclui a subárvore inteira. Errar isso ENCOLHE o conjunto entregue e faz
// toda asserção derivada passar vazia — daí o piso em shipped-set.test.mjs.
const translate = (body) => {
  let out = ""
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === "*") {
      if (body[index + 1] === "*") {
        while (body[index + 1] === "*") index += 1
        if (body[index + 1] === "/") {
          out += "(?:.*/)?"
          index += 1
        } else {
          out += ".*"
        }
      } else {
        out += "[^/]*"
      }
    } else if (char === "?") {
      out += "[^/]"
    } else if (char === "[") {
      const end = body.indexOf("]", index + 1)
      if (end === -1) {
        out += "\\["
      } else {
        const body_ = body.slice(index + 1, end)
        out += `[${body_.startsWith("!") ? `^${body_.slice(1)}` : body_}]`
        index = end
      }
    } else {
      out += char.replace(/[.+^${}()|\\]/g, "\\$&")
    }
  }
  return out
}

const compiled = new Map()

export const excludeMatcher = (pattern) => {
  const cached = compiled.get(pattern)
  if (cached) return cached
  let body = String(pattern).trim()
  while (body.endsWith("/")) body = body.slice(0, -1)
  let anchored = false
  if (body.startsWith("/")) {
    anchored = true
    body = body.slice(1)
  } else {
    anchored = body.includes("/")
  }
  const source = anchored
    ? `^${translate(body)}(?:/.*)?$`
    : `^(?:.*/)?${translate(body)}(?:/.*)?$`
  const matcher = new RegExp(source)
  compiled.set(pattern, matcher)
  return matcher
}

export const isExcluded = (destination, excludes) =>
  excludes.some((pattern) => excludeMatcher(pattern).test(destination))

// Raízes condicionais: as entradas rastreadas
// `{% if web_stack == 'next' %}apps{% endif %}/web` e a gêmea `vite` são symlinks para
// `apps/web-next` / `apps/web-vite`, e o copier copia o alvo. Modelo estático fiel e
// agnóstico de stack (o guard roda no template, onde não existe resposta `web_stack`):
// `apps/web/**` está presente quando o arquivo correspondente existe em qualquer um dos
// dois shells. Não é um rename `web-vite|web-next -> web`; a origem é o symlink.
const CONDITIONAL_WEB_ROOTS = [
  ["apps/web-next/", "apps/web/"],
  ["apps/web-vite/", "apps/web/"],
]

const JINJA_SUFFIX = ".jinja"

// Caminho de DESTINO no filho, que é contra quem o `_exclude` casa (ver copier.yml:78-80);
// `null` para a própria entrada condicional, cuja subárvore vem do alvo do symlink.
export const renderedDestination = (trackedPath) => {
  if (trackedPath.includes("{%")) return null
  const rendered = trackedPath.endsWith(JINJA_SUFFIX)
    ? trackedPath.slice(0, -JINJA_SUFFIX.length)
    : trackedPath
  for (const [source, destination] of CONDITIONAL_WEB_ROOTS) {
    if (rendered.startsWith(source)) {
      return destination + rendered.slice(source.length)
    }
  }
  return rendered
}

export const shippedSet = ({
  tracked = trackedFiles(),
  excludes = readExcludes(),
} = {}) => {
  const shipped = new Set()
  for (const file of tracked) {
    const destination = renderedDestination(file)
    if (destination === null) continue
    if (isExcluded(destination, excludes)) continue
    shipped.add(destination)
  }
  return shipped
}

// Stems dos workflows que o `_exclude` remove — derivados em tempo de execução, nunca
// escritos à mão: hoje `release` e `format`.
export const excludedWorkflowStems = (excludes = readExcludes()) => {
  const stems = new Set()
  for (const entry of excludes) {
    const match = /^\/?\.github\/workflows\/([^/*?[\]]+)\.ya?ml$/.exec(
      String(entry).trim()
    )
    if (match) stems.add(match[1])
  }
  return stems
}
