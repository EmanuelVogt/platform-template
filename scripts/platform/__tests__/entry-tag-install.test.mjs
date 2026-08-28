import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { addCommand } from "../lib/commands/add.mjs"
import { listCommand } from "../lib/commands/list.mjs"
import { entryTagRemote, entryTagRequired } from "../lib/entry-tags.mjs"
import { EXIT_CODES } from "../lib/exit-codes.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_FIXTURE = path.join(TESTS_DIR, "fixtures/catalog")
const CHILD_FIXTURE = path.join(TESTS_DIR, "fixtures/child")
const KERNEL_TAG = "v3.0.1"
const RELEASED_AT = "v3.0.0"

function git(cwd, ...args) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  })
}

function writeEntry(catalogRoot, relDir, manifest) {
  const dir = path.join(catalogRoot, relDir)
  mkdirSync(path.join(dir, "api"), { recursive: true })
  writeFileSync(
    path.join(dir, "module.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
  writeFileSync(
    path.join(dir, "api", `${manifest.name}.module.ts`),
    `export class ${manifest.name} {}\n`
  )
}

// Um repositório git de verdade, servido por `file://`: um `ls-remote` mockado só
// provaria que o mock concorda com o teste.
//
// A forma tem que ser a real, e a real são DOIS commits: a tag de entrada ancora
// no commit do kernel que lançou aquela versão (AD-040), que costuma ser uma
// release anterior à instalada. É isso que torna o clone de `resolveCatalog`
// (`--depth 1 --branch <ref>`) uma fonte não confiável — ele carrega as tags que
// apontam para o único commit buscado, então enxerga a tag de entrada quando ela
// ancora na release instalada e não a enxerga quando ancora numa anterior.
function makeTemplateRepo({ entryTags = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "entry-tag-origin-"))
  git(dir, "init", "-q", "-b", "main")
  git(dir, "config", "uploadpack.allowfilter", "true")
  cpSync(CATALOG_FIXTURE, path.join(dir, "catalog"), { recursive: true })
  writeEntry(path.join(dir, "catalog"), "beta/single-tenant", {
    name: "beta",
    variant: "single-tenant",
    version: "1.0.0",
    kernelRange: ">=1.0.0 <2.0.0",
  })
  writeEntry(path.join(dir, "catalog"), "gamma", {
    name: "gamma",
    version: "1.0.0",
    kernelRange: ">=1.0.0 <2.0.0",
    dependsOn: [{ name: "alpha", range: ">=1.0.0" }],
  })
  git(dir, "add", "-A")
  git(dir, "commit", "-qm", "catalog")
  git(dir, "tag", RELEASED_AT)
  for (const tag of entryTags) git(dir, "tag", tag)
  writeFileSync(path.join(dir, "KERNEL"), "kernel-only change\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-qm", "kernel")
  git(dir, "tag", KERNEL_TAG)
  return dir
}

function makeChild() {
  const dir = mkdtempSync(path.join(tmpdir(), "entry-tag-child-"))
  cpSync(CHILD_FIXTURE, dir, { recursive: true })
  renameSync(
    path.join(dir, "copier-answers.yml"),
    path.join(dir, ".copier-answers.yml")
  )
  return dir
}

// `git` roda de verdade; o resto do harness do `add` (pnpm contract, vitest,
// drizzle) responde 0 sem executar nada.
function makeRun() {
  const calls = []
  const run = (command, args, options) => {
    calls.push({ command, args, options })
    if (command !== "git") return { status: 0, stdout: "", stderr: "" }
    const result = spawnSync(command, args, { encoding: "utf8", ...options })
    return {
      status: result.status ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    }
  }
  return { run, calls }
}

function lockOf(child) {
  return JSON.parse(
    readFileSync(path.join(child, ".platform-modules.lock"), "utf8")
  )
}

async function capture(stream, fn) {
  const original = process[stream].write.bind(process[stream])
  let output = ""
  process[stream].write = (chunk) => {
    output += chunk
    return true
  }
  try {
    return { result: await fn(), output }
  } finally {
    process[stream].write = original
  }
}

const captureStderr = (fn) => capture("stderr", fn)

// `resolveCatalog` guarda o clone em `$TMPDIR/platform-catalog/<sha1(ref)>` e não
// aceita injeção de cacheRoot vindo do `add`; sem isto cada execução da suíte
// deixa clones para trás.
function cloneDirFor(ref) {
  return path.join(
    tmpdir(),
    "platform-catalog",
    createHash("sha1").update(ref).digest("hex").slice(0, 12)
  )
}

async function install({ origin, gitRef, name, options = {}, keepCache }) {
  const ref = gitRef ? `file://${origin}#${gitRef}` : `file://${origin}`
  const child = makeChild()
  const { run, calls } = makeRun()
  const { result, output } = await captureStderr(() =>
    addCommand({
      name,
      options: { "catalog-ref": ref, "skip-tests": true, ...options },
      cwd: child,
      run,
    })
  )
  const cloneDir = cloneDirFor(ref)
  if (!keepCache) rmSync(cloneDir, { recursive: true, force: true })
  return { code: result, stderr: output, child, calls, ref, cloneDir }
}

test("entryTagRequired só exige a tag quando o catálogo veio de uma release", () => {
  const required = (kind, ref) => entryTagRequired({ kind, ref })
  assert.equal(required("git", "gh:o/r#v3.0.1"), true)
  assert.equal(required("git", "gh:o/r#main"), false)
  assert.equal(required("git", "gh:o/r"), false)
  // `git describe` de um commit depois da tag não é a release, é o que veio
  // depois dela.
  assert.equal(required("git", "gh:o/r#v3.0.1-3-gabc1234"), false)
  assert.equal(required("local", "/tmp/tpl/catalog#v3.0.1"), false)
})

test("entryTagRemote aponta para o repositório do template, nunca para o clone", () => {
  assert.equal(
    entryTagRemote({
      kind: "git",
      ref: "gh:o/r#v3.0.1",
      root: "/cache/catalog",
    }),
    "https://github.com/o/r.git"
  )
  assert.equal(
    entryTagRemote({
      kind: "local",
      ref: "/tpl/catalog",
      root: "/tpl/catalog",
    }),
    "/tpl"
  )
})

test("a tag da entrada é gravada no lock, resolvida contra o origin e não contra o clone raso", async () => {
  const origin = makeTemplateRepo({ entryTags: ["catalog/alpha@1.0.0"] })
  const { code, child, calls, cloneDir } = await install({
    origin,
    gitRef: KERNEL_TAG,
    name: "alpha",
    keepCache: true,
  })

  assert.equal(code, EXIT_CODES.OK)
  assert.equal(lockOf(child).modules.alpha.entryTag, "catalog/alpha@1.0.0")

  const lsRemote = calls.filter(
    ({ command, args }) => command === "git" && args[0] === "ls-remote"
  )
  assert.equal(lsRemote.length, 1)
  assert.equal(lsRemote[0].args.at(-2), `file://${origin}`)

  // A prova de que perguntar ao clone não serviria: ele é `--depth 1 --branch
  // <kernel tag>` e não carrega tag de entrada nenhuma. Sem o `existsSync` esta
  // asserção passaria por cegueira, com um cwd apagado.
  assert.equal(existsSync(cloneDir), true)
  const cloneTags = spawnSync("git", ["tag", "--list"], {
    cwd: cloneDir,
    encoding: "utf8",
  })
  assert.equal(cloneTags.status, 0)
  assert.equal(
    cloneTags.stdout.split("\n").filter((tag) => tag.startsWith("catalog/"))
      .length,
    0
  )
  rmSync(cloneDir, { recursive: true, force: true })
})

test("tag ausente com o catálogo vindo de uma release aborta a instalação", async () => {
  const origin = makeTemplateRepo()
  const { code, stderr, child } = await install({
    origin,
    gitRef: KERNEL_TAG,
    name: "alpha",
  })

  assert.equal(code, EXIT_CODES.ENTRY_TAG_MISSING)
  assert.match(stderr, /catalog\/alpha@1\.0\.0/)
  assert.match(stderr, /--allow-untagged/)
  assert.equal(existsSync(path.join(child, ".platform-modules.lock")), false)
  assert.equal(
    existsSync(path.join(child, "apps/api/src/modules/alpha")),
    false,
    "nenhum arquivo pode ter sido copiado antes da recusa"
  )
})

test("--allow-untagged instala e registra a ausência, em vez de omitir o campo", async () => {
  const origin = makeTemplateRepo()
  const { code, child } = await install({
    origin,
    gitRef: KERNEL_TAG,
    name: "alpha",
    options: { "allow-untagged": true },
  })

  assert.equal(code, EXIT_CODES.OK)
  const entry = lockOf(child).modules.alpha
  assert.equal(entry.entryTag, null)
  assert.ok("entryTag" in entry, "perguntamos e não havia: o lock diz isso")
})

test("um ref móvel instala sem tag, avisa, e não é tratado como release", async () => {
  const origin = makeTemplateRepo()
  const { code, stderr, child } = await install({
    origin,
    gitRef: "main",
    name: "alpha",
  })

  assert.equal(code, EXIT_CODES.OK)
  assert.equal(lockOf(child).modules.alpha.entryTag, null)
  assert.match(stderr, /não veio de uma release/)
})

test("a tag de nome puro não satisfaz uma entrada que declara variant", async () => {
  const origin = makeTemplateRepo({ entryTags: ["catalog/beta@1.0.0"] })
  const { code, stderr } = await install({
    origin,
    gitRef: KERNEL_TAG,
    name: "beta",
    options: { variant: "single-tenant" },
  })

  assert.equal(code, EXIT_CODES.ENTRY_TAG_MISSING)
  assert.match(stderr, /catalog\/beta-single-tenant@1\.0\.0/)
})

test("a tag com o segmento de variant satisfaz a mesma entrada", async () => {
  const origin = makeTemplateRepo({
    entryTags: ["catalog/beta-single-tenant@1.0.0"],
  })
  const { code, child } = await install({
    origin,
    gitRef: KERNEL_TAG,
    name: "beta",
    options: { variant: "single-tenant" },
  })

  assert.equal(code, EXIT_CODES.OK)
  assert.equal(
    lockOf(child).modules.beta.entryTag,
    "catalog/beta-single-tenant@1.0.0"
  )
})

test("--with-deps resolve todas as entradas com um único ls-remote", async () => {
  const origin = makeTemplateRepo({
    entryTags: ["catalog/alpha@1.0.0", "catalog/gamma@1.0.0"],
  })
  const { code, child, calls } = await install({
    origin,
    gitRef: KERNEL_TAG,
    name: "gamma",
    options: { "with-deps": true },
  })

  assert.equal(code, EXIT_CODES.OK)
  const { modules } = lockOf(child)
  assert.equal(modules.alpha.entryTag, "catalog/alpha@1.0.0")
  assert.equal(modules.gamma.entryTag, "catalog/gamma@1.0.0")
  assert.equal(
    calls.filter(
      ({ command, args }) => command === "git" && args[0] === "ls-remote"
    ).length,
    1
  )
})

// Gravar a proveniência num campo que nenhum comando mostra recriaria o defeito
// que a AD-040 nomeia: um artefato sem quem o contradiga.
test("module list mostra a tag resolvida", async () => {
  const origin = makeTemplateRepo({ entryTags: ["catalog/alpha@1.0.0"] })
  const { child } = await install({
    origin,
    gitRef: KERNEL_TAG,
    name: "alpha",
  })

  const { output } = await capture("stdout", () =>
    listCommand({ options: { "catalog-ref": CATALOG_FIXTURE }, cwd: child })
  )
  assert.match(output, /^alpha: lock=1\.0\.0 .*tag=catalog\/alpha@1\.0\.0$/m)
})

test("module list distingue a ausência de tag de um lock anterior à checagem", async () => {
  const origin = makeTemplateRepo()
  const { child } = await install({
    origin,
    gitRef: "main",
    name: "alpha",
  })
  const lockPath = path.join(child, ".platform-modules.lock")

  const withNull = await capture("stdout", () =>
    listCommand({ options: { "catalog-ref": CATALOG_FIXTURE }, cwd: child })
  )
  assert.match(withNull.output, /tag=\(nenhuma\)/)

  const lock = JSON.parse(readFileSync(lockPath, "utf8"))
  delete lock.modules.alpha.entryTag
  writeFileSync(lockPath, JSON.stringify(lock, null, 2))
  const legacy = await capture("stdout", () =>
    listCommand({ options: { "catalog-ref": CATALOG_FIXTURE }, cwd: child })
  )
  assert.ok(!legacy.output.includes("tag="))
})

test("falha ao consultar o origin instala sem gravar campo nenhum", async () => {
  const child = makeChild()
  const calls = []
  const run = (command, args) => {
    calls.push({ command, args })
    if (command === "git" && args[0] === "ls-remote") {
      return { status: 128, stdout: "", stderr: "boom" }
    }
    return { status: 0, stdout: "", stderr: "" }
  }
  const { result, output } = await captureStderr(() =>
    addCommand({
      name: "alpha",
      options: { "catalog-ref": CATALOG_FIXTURE, "skip-tests": true },
      cwd: child,
      run,
    })
  )

  assert.equal(result, EXIT_CODES.OK)
  assert.match(output, /não foi possível listar as tags/)
  // Ausente, não `null`: não perguntamos, então não temos o que afirmar.
  assert.ok(!("entryTag" in lockOf(child).modules.alpha))
})
