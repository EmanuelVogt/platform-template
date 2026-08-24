import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"
import { CONTRACT_ENV_DEFAULTS } from "../lib/child.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")
const CI_PATH = path.join(ROOT_DIR, ".github/workflows/ci.yml")

const ci = parseYaml(readFileSync(CI_PATH, "utf8"))

function stepRunning(job, command) {
  return job.steps.find((step) => step.run?.trim() === command)
}

// `pnpm contract:check` monta o grafo Nest inteiro e o boot valida env fail-fast.
// O job roda sem serviços, então os valores têm de ser placeholders inertes — e
// como copier.yml não copia lib/child.mjs para o filho, o YAML é a única cópia
// que o produto recebe. Sem este teste as duas listas divergem em silêncio e o
// filho descobre no primeiro CI dele.
test("o step contract:check do ci.yml carrega exatamente CONTRACT_ENV_DEFAULTS", () => {
  const step = stepRunning(ci.jobs.quality, "pnpm contract:check")
  assert.ok(step, "o job quality perdeu o step pnpm contract:check")
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(step.env ?? {}).map(([key, value]) => [key, String(value)])
    ),
    CONTRACT_ENV_DEFAULTS,
    "o env do step divergiu de CONTRACT_ENV_DEFAULTS (scripts/platform/lib/child.mjs)"
  )
})

test("nenhum valor de CONTRACT_ENV_DEFAULTS aponta para um serviço real", () => {
  for (const key of ["DATABASE_URL", "REDIS_URL"]) {
    assert.match(
      CONTRACT_ENV_DEFAULTS[key],
      /placeholder|localhost/,
      `${key} deveria ser inerte — o export do contrato não abre conexão`
    )
  }
})
