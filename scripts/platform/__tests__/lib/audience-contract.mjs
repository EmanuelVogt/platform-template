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

// --- AUD-05/AUD-07: nenhum doc entregue nomeia um caminho que o filho não tem ---

export const shippedDocs = ({
  tracked = trackedFiles(),
  excludes = readExcludes(),
} = {}) => {
  const docs = []
  const seen = new Set()
  for (const file of tracked) {
    const destination = renderedDestination(file)
    if (destination === null || !destination.endsWith(".md")) continue
    if (isExcluded(destination, excludes) || seen.has(destination)) continue
    seen.add(destination)
    docs.push({ destination, source: file })
  }
  return docs
}

// Registro histórico: nomeia caminhos que estavam certos em `v1.x` e hoje não existem em
// lugar nenhum (39 dos 93 achados do protótipo). Isento como arquivo, e a isenção é
// asseverada nominalmente para não alargar em silêncio.
export const EXEMPT_DOCS = ["docs/dev/template-changelog.md"]

// SPEC_DEVIATION: the guard scans the repository's own handbooks, not `.agents/skills/**`.
// Reason: the skills tree is synced payload (`pnpm skills:sync` materialises it into
// `.claude/skills/`, already situation 2), half of it third-party (`shadcn`,
// `vercel-react-best-practices`) and maintained upstream — repairing there means diverging
// from the origin, the same argument as the changelog exemption. Measured: 19 of the 22
// findings against the live tree live here, none in a file this feature repairs. Prefix
// exemption, asserted by name; widening it means editing this line.
export const EXEMPT_DOC_PREFIXES = [".agents/skills/"]

// O filho cria estes caminhos; o template não os rastreia, e mesmo assim citá-los num doc
// entregue está certo. Cada entrada nomeia quem cria — esta lista é o raio de cegueira do
// guard, então uma entrada errada o cega.
export const CHILD_CREATED_PREFIXES = [
  ".specs/", // a skill tlc-spec-driven escreve no filho
  ".claude/skills/", // `pnpm skills:sync` materializa a partir de `.agents/skills/`
  "generated/", // `pnpm contract` gera do OpenAPI
  ".worktrees/", // `git worktree add` cria
  "apps/api/.env", // cópia local de `.env.example`, nunca versionada
]

const PLACEHOLDER_MARKS = ["<", ">", "{{", "{", "*", "…"]
const IGNORED_PREFIXES = ["/", "~", "$", "@"]

const isPlaceholderOrForeign = (token) =>
  token === "" ||
  token.includes(" ") ||
  token.includes("://") ||
  token.startsWith("mailto:") ||
  PLACEHOLDER_MARKS.some((mark) => token.includes(mark)) ||
  IGNORED_PREFIXES.some((prefix) => token.startsWith(prefix))

// Metavariável de convenção de nome — `docs/advisories/ADV-YYYYMMDD-NN.md` nomeia o FORMATO
// de uma advisory, não um arquivo: mesma classe de `catalog/<entry>` e `0000_*` do
// § Edge Cases, com outra grafia. Testada só contra token JÁ ausente, então nunca cega uma
// referência que existe (`docs/advisories/APPLIED.md` resolve antes de chegar aqui).
const METAVARIABLE = /YYYY|MMDD|-NN|X\.Y\.Z/

// `docs/agents/workflow.md:109` cita `apps/api/vitest.config.mts:20` — a citação de linha
// faz parte da convenção do repo e não é parte do caminho.
const stripLineCitation = (token) => token.replace(/:\d+(?:-\d+)?$/, "")

const stripAnchor = (token) => token.replace(/#.*$/, "")

export const presenceIndex = (shipped) => {
  const directories = new Set()
  for (const file of shipped) {
    const segments = file.split("/")
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"))
    }
  }
  return { files: shipped, directories }
}

export const topLevelEntries = ({ tracked = trackedFiles() } = {}) => {
  const roots = new Set()
  for (const file of tracked) {
    const destination = renderedDestination(file)
    if (destination === null) continue
    roots.add(destination.split("/")[0])
  }
  return roots
}

const isChildCreated = (token) =>
  CHILD_CREATED_PREFIXES.some((prefix) => {
    const bare = prefix.replace(/\/$/, "")
    return token === bare || token.startsWith(`${bare}/`)
  })

// Gramática fixada com o dono antes da onda 1: `<!-- audience-contract: <token> — <razão> -->`
// no FIM de uma linha que carrega prosa, um token por comentário, razão obrigatória.
// Um comentário em linha própria não isenta nada — em CommonMark um bloco HTML interrompe o
// parágrafo em que está, então uma isenção escrita assim mudaria como o doc renderiza.
//
// SPEC_DEVIATION: the waiver is matched over its PARAGRAPH, not over its single source line.
// Reason: the repo hard-wraps prose at ~90 columns, so a token and the end of its sentence
// routinely land on different source lines — `docs/catalog/catalog.md` carries `catalog/` on
// `:4` and the waiver wave 1 wrote for it on `:5`. Per-line matching would report a doc that
// obeys the pinned grammar. The spelling is unchanged and the own-line rule still holds.
const WAIVER_PATTERN =
  /<!--\s*audience-contract:\s*([^—]+?)\s+—\s+(\S[^]*?)\s*-->/g
const WAIVER_SHAPE = /<!--\s*audience-contract:[^]*?-->/g

export const waivedTokens = (line) => {
  const waived = new Set()
  if (line.replace(WAIVER_SHAPE, "").trim() === "") return waived
  for (const match of line.matchAll(WAIVER_PATTERN)) {
    const token = match[1].trim()
    const reason = match[2].trim()
    if (token !== "" && reason !== "") waived.add(token)
  }
  return waived
}

// Buraco conhecido, declarado e não escondido (docs/test/testing.md:40-44): tokens dentro de
// bloco cercado não são varridos — `git worktree add .worktrees/<slug>` e afins são exemplos
// de comando, não referências, e varrê-los devolveria ruído em vez de defeito.
const blankFencedBlocks = (lines) => {
  let inFence = false
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return ""
    }
    return inFence ? "" : line
  })
}

const LINK_PATTERN = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g
const CODE_SPAN_PATTERN = /(`+)([^`]+?)\1/g

const paragraphOf = (lines) => {
  const owner = []
  let current = 0
  lines.forEach((line, index) => {
    if (line.trim() === "") current = index + 1
    owner[index] = current
  })
  return owner
}

const scannableLines = (text) => {
  const lines = blankFencedBlocks(text.split("\n"))
  const paragraphs = paragraphOf(lines)
  const waivedByParagraph = new Map()
  lines.forEach((line, index) => {
    const paragraph = paragraphs[index]
    if (!waivedByParagraph.has(paragraph)) {
      waivedByParagraph.set(paragraph, new Set())
    }
    for (const token of waivedTokens(line)) {
      waivedByParagraph.get(paragraph).add(token)
    }
  })
  return lines.map((line, index) => ({
    line,
    number: index + 1,
    waived: waivedByParagraph.get(paragraphs[index]),
  }))
}

export const documentTokens = (text, destination, roots) => {
  const found = []
  const directory = path.posix.dirname(destination)
  scannableLines(text).forEach(({ line, number, waived }) => {
    const index = number - 1
    const push = (raw, resolved) => {
      if (waived.has(raw)) return
      found.push({ line: index + 1, token: raw, resolved })
    }
    for (const match of line.matchAll(LINK_PATTERN)) {
      const raw = match[1]
      const cleaned = stripLineCitation(stripAnchor(raw))
      if (cleaned === "" || isPlaceholderOrForeign(cleaned)) continue
      const resolved = path.posix
        .normalize(path.posix.join(directory, cleaned))
        .replace(/\/$/, "")
      if (resolved.startsWith("..") || resolved === ".") continue
      push(raw, resolved)
    }
    for (const match of line.matchAll(CODE_SPAN_PATTERN)) {
      const raw = match[2].trim()
      if (!raw.includes("/")) continue
      const cleaned = stripLineCitation(raw).replace(/\/$/, "")
      if (isPlaceholderOrForeign(cleaned)) continue
      // Um code span cuja primeira parte não é uma entrada de topo rastreada é `app/`,
      // `entities/` ou `React/Next.js` — vocabulário, não caminho do repositório.
      if (!roots.has(cleaned.split("/")[0])) continue
      push(raw, path.posix.normalize(cleaned))
    }
  })
  return found
}

export const auditShippedDocs = ({
  docs = shippedDocs(),
  shipped = shippedSet(),
  roots = topLevelEntries(),
  exempt = EXEMPT_DOCS,
  exemptPrefixes = EXEMPT_DOC_PREFIXES,
  readDoc = (source) => readFileSync(path.join(ROOT, source), "utf8"),
} = {}) => {
  const index = presenceIndex(shipped)
  const findings = []
  for (const doc of docs) {
    if (exempt.includes(doc.destination)) continue
    if (exemptPrefixes.some((prefix) => doc.destination.startsWith(prefix))) {
      continue
    }
    for (const hit of documentTokens(
      readDoc(doc.source),
      doc.destination,
      roots
    )) {
      if (index.files.has(hit.resolved) || index.directories.has(hit.resolved))
        continue
      if (isChildCreated(hit.resolved)) continue
      if (METAVARIABLE.test(hit.resolved)) continue
      findings.push({
        file: doc.destination,
        line: hit.line,
        token: hit.token,
        message: `${doc.destination}:${hit.line} — \`${hit.token}\` não existe no que o filho recebe`,
      })
    }
  }
  return findings
}

// --- AUD-06: nenhum doc entregue nomeia um workflow que o `_exclude` remove ---

// A regra é mais larga que a letra de AUD-06 ("exatamente igual ao stem") de propósito: o
// token de hoje é `` `release.yml` `` (docs/agents/workflow.md), que não é o stem nem um
// token de caminho — o span não tem `/`. `<stem>`, `<stem>.yml` e `<stem>.yaml` são a mesma
// intenção com a grafia que o arquivo usa. Igualdade exata contra essas três formas mantém
// `pnpm catalog:lint` e `catalog/` fora da regra.
export const workflowNameForms = (stem) => [stem, `${stem}.yml`, `${stem}.yaml`]

export const documentWorkflowNames = (text, stems) => {
  const forms = new Map()
  for (const stem of stems) {
    for (const form of workflowNameForms(stem)) forms.set(form, stem)
  }
  const found = []
  for (const { line, number, waived } of scannableLines(text)) {
    for (const match of line.matchAll(CODE_SPAN_PATTERN)) {
      const raw = match[2].trim()
      const stem = forms.get(raw)
      if (stem === undefined || waived.has(raw)) continue
      found.push({ line: number, token: raw, stem })
    }
  }
  return found
}

export const auditWorkflowNames = ({
  docs = shippedDocs(),
  stems = excludedWorkflowStems(),
  exempt = EXEMPT_DOCS,
  exemptPrefixes = EXEMPT_DOC_PREFIXES,
  readDoc = (source) => readFileSync(path.join(ROOT, source), "utf8"),
} = {}) => {
  const findings = []
  for (const doc of docs) {
    if (exempt.includes(doc.destination)) continue
    if (exemptPrefixes.some((prefix) => doc.destination.startsWith(prefix))) {
      continue
    }
    for (const hit of documentWorkflowNames(readDoc(doc.source), stems)) {
      findings.push({
        file: doc.destination,
        line: hit.line,
        token: hit.token,
        message: `${doc.destination}:${hit.line} — \`${hit.token}\` nomeia o workflow ${hit.stem}, que o \`_exclude\` remove do filho`,
      })
    }
  }
  return findings
}
