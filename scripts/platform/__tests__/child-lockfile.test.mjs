import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
)
const copierYml = () =>
  parseYaml(readFileSync(path.join(ROOT, "copier.yml"), "utf8"))

// O workspace do filho difere do template por construção (`apps/web-vite` e
// `apps/web-next` viram `apps/web`), então os importers do lockfile copiado
// nunca casam com a árvore renderizada. O install da geração é quem os
// reescreve — medido: 1595 -> 1553 pacotes, zero versão nova, só as chaves de
// importer se movem. Sem o flag, todo ambiente com `CI` definido, onde o pnpm
// implica `--frozen-lockfile`, morre em ERR_PNPM_OUTDATED_LOCKFILE, e leva
// junto template:smoke, catalog:check e o primeiro CI de todo produto gerado.
test("o install da geração re-resolve os importers em vez de exigir o lockfile do template", () => {
  const installs = copierYml()._tasks.filter((task) =>
    task.command?.startsWith("pnpm install")
  )
  assert.equal(
    installs.length,
    1,
    "esperava exatamente um pnpm install nos _tasks"
  )
  assert.equal(installs[0].command, "pnpm install --no-frozen-lockfile")
})

test("os dois shells web continuam fora da cópia — é isso que torna o lockfile do filho diferente", () => {
  const exclude = copierYml()._exclude ?? []
  for (const dir of ["apps/web-vite", "apps/web-next"]) {
    assert.ok(
      exclude.includes(dir),
      `${dir} saiu de _exclude — reveja a premissa de --no-frozen-lockfile`
    )
  }
})
