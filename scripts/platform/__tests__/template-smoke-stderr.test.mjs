import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { EXIT_CODES } from "../lib/exit-codes.mjs"
import { formatStderr, runTemplateSmoke } from "../../template-smoke.mjs"

const SOURCE = readFileSync(
  new URL("../../template-smoke.mjs", import.meta.url),
  "utf8"
)

function stubRun(overrides) {
  return (command, args = []) => {
    const key = [command, ...args].join(" ")
    const match = Object.entries(overrides ?? {}).find(([pattern]) =>
      key.includes(pattern)
    )
    return match ? match[1] : { status: 0, stdout: "", stderr: "" }
  }
}

function immediateSleep() {
  return Promise.resolve()
}

const GREEN = {
  "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
  "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
  "docker exec cid123 redis-cli ping": {
    status: 0,
    stdout: "PONG\n",
    stderr: "",
  },
  "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
  "pnpm --filter api run db:migrate": { status: 0, stdout: "", stderr: "" },
  "docker exec cid123 psql": {
    status: 0,
    stdout: "_kernel\ndrizzle\n",
    stderr: "",
  },
  "pnpm vitest run --project api apps/api/src/modules/module-boundaries.spec.ts":
    { status: 0, stdout: "", stderr: "" },
}

function failing(pattern, marker) {
  return { ...GREEN, [pattern]: { status: 1, stdout: "", stderr: marker } }
}

test("formatStderr devolve string vazia quando não há stderr, e nunca quebra com undefined", () => {
  assert.equal(formatStderr(""), "")
  assert.equal(formatStderr("   \n  \n"), "")
  assert.equal(formatStderr(undefined), "")
  assert.equal(formatStderr(null), "")
})

test("formatStderr rotula a origem e corta em dez linhas", () => {
  assert.equal(formatStderr("boom"), " — stderr do child:\nboom")
  assert.equal(formatStderr("boom", "docker"), " — stderr do docker:\nboom")
  const long = Array.from({ length: 25 }, (_, i) => `linha ${i}`).join("\n")
  const detail = formatStderr(long)
  assert.equal(detail.split("\n").length, 11)
  assert.ok(detail.includes("linha 9"))
  assert.ok(!detail.includes("linha 10"))
})

// O defeito que este guard existe para prender: checkPlatformCli logava só
// "(código 1)" e escondeu por semanas um subcomando que o child nunca registrou.
// O stderr sempre esteve no resultado de run() — o call site é que o descartava.
test("nenhum log de falha de template-smoke.mjs reporta só o código de saída", () => {
  const offenders = SOURCE.split("\n")
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => !line.startsWith("//"))
    .filter(({ line }) => /falh|\(código \$\{/.test(line))
    .filter(({ line }) => !line.includes("formatStderr("))
    .map(({ number, line }) => `${number}: ${line}`)
  assert.deepEqual(
    offenders,
    [],
    "um call site de run() voltou a descartar o stderr"
  )
})

function failureGuardedBlocks(text) {
  const lines = text.split("\n")
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!/if \([^)]*status !== 0\) \{/.test(lines[i])) continue
    let depth = 0
    const body = []
    for (let j = i; j < lines.length; j += 1) {
      depth += (lines[j].match(/\{/g) ?? []).length
      depth -= (lines[j].match(/\}/g) ?? []).length
      body.push(lines[j])
      if (depth === 0) break
    }
    blocks.push({ line: i + 1, body: body.join("\n") })
  }
  return blocks
}

test("todo ramo `status !== 0` de template-smoke.mjs que loga passa pelo formatStderr", () => {
  const blocks = failureGuardedBlocks(SOURCE)
  assert.ok(blocks.length >= 10, "o parser não encontrou os ramos de falha")
  const offenders = blocks
    .filter(({ body }) => body.includes("log("))
    .filter(({ body }) => !body.includes("formatStderr("))
    .map(({ line }) => `template-smoke.mjs:${line}`)
  assert.deepEqual(offenders, [], "ramo de falha loga sem o stderr do processo")
})

const SITES = [
  {
    name: "copier no render do child",
    marker: "COPIER-STDERR",
    options: {
      run: stubRun(GREEN),
      renderChildFn: () => ({ status: 1, stdout: "", stderr: "COPIER-STDERR" }),
    },
  },
  {
    name: "pnpm install do child",
    marker: "INSTALL-STDERR",
    options: {
      run: stubRun(GREEN),
      installChildFn: () => ({
        status: 1,
        stdout: "",
        stderr: "INSTALL-STDERR",
      }),
    },
  },
  {
    name: "pnpm format:check",
    marker: "FORMAT-STDERR",
    options: { run: stubRun(failing("pnpm format:check", "FORMAT-STDERR")) },
  },
  {
    name: "o gate pnpm check/test/test:db",
    marker: "GATE-STDERR",
    options: { run: stubRun(failing("pnpm test:db", "GATE-STDERR")) },
  },
  {
    name: "docker run do Postgres efêmero",
    marker: "DOCKER-RUN-STDERR",
    options: { run: stubRun(failing("docker run", "DOCKER-RUN-STDERR")) },
  },
  {
    name: "docker port do Postgres efêmero",
    marker: "DOCKER-PORT-STDERR",
    options: {
      run: stubRun(failing("docker port cid123", "DOCKER-PORT-STDERR")),
    },
  },
  {
    name: "db:migrate",
    marker: "MIGRATE-STDERR",
    options: {
      run: stubRun(
        failing("pnpm --filter api run db:migrate", "MIGRATE-STDERR")
      ),
    },
  },
  {
    name: "a consulta psql dos schemas",
    marker: "PSQL-STDERR",
    options: {
      run: stubRun(failing("docker exec cid123 psql", "PSQL-STDERR")),
    },
  },
  {
    name: "o build da api",
    marker: "BUILD-STDERR",
    options: {
      run: stubRun(failing("pnpm --filter api run build", "BUILD-STDERR")),
    },
  },
  {
    name: "a RULE C",
    marker: "RULE-C-STDERR",
    options: {
      run: stubRun(
        failing(
          "pnpm vitest run --project api apps/api/src/modules/module-boundaries.spec.ts",
          "RULE-C-STDERR"
        )
      ),
    },
  },
  {
    name: "pnpm platform status",
    marker: "CLI-STATUS-STDERR",
    options: {
      run: stubRun(failing("pnpm platform status", "CLI-STATUS-STDERR")),
    },
  },
  {
    name: "pnpm platform module list",
    marker: "CLI-LIST-STDERR",
    options: {
      run: stubRun(failing("pnpm platform module list", "CLI-LIST-STDERR")),
    },
  },
]

for (const [index, site] of SITES.entries()) {
  test(`runTemplateSmoke imprime o stderr de ${site.name} quando ele falha`, async () => {
    const logs = []
    const code = await runTemplateSmoke({
      scratchDir: `/tmp/template-smoke-stderr-${index}`,
      renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
      installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
      spawnProcess: () => ({ kill: () => {} }),
      fetchImpl: async () => ({ status: 200 }),
      sleep: immediateSleep,
      log: (line) => logs.push(line),
      ...site.options,
    })
    assert.notEqual(code, EXIT_CODES.OK)
    assert.ok(
      logs.some((line) => line.includes(site.marker)),
      `o stderr não chegou ao log:\n${logs.join("\n")}`
    )
  })
}
