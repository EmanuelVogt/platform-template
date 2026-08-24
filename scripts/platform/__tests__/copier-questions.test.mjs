import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { parse as parseYaml } from "yaml"

// T41 — dono único de copier.yml para LOC-01, RUN-03, TOOL-10, TOOL-13 e BRAND-08.
// Mesma abordagem de copier-delivery.test.mjs: parseia o copier.yml de verdade e verifica
// contra ele e contra a lista de arquivos rastreados — nunca contra uma cópia de fixture.

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
)

const copierYml = () =>
  parseYaml(readFileSync(path.join(ROOT, "copier.yml"), "utf8"))

const manifest = (relativePath) =>
  JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"))

const tracked = (...files) =>
  execFileSync("git", ["ls-files", "-z", ...files], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)

// LOC-01 — F-agnostic-leaks-2: "adiciona pergunta do copier (product_locale, default pt-BR)".
// AD-034: nenhuma string de um filho já gerado pode mudar num `copier update` — o default
// precisa casar com o que todo filho já tem hardcoded (pt-BR), senão a garantia quebra no
// instante em que esta pergunta é enviada.
test("product_locale exists with default pt-BR", () => {
  const question = copierYml().product_locale
  assert.ok(question, "copier.yml precisa da pergunta product_locale")
  assert.equal(question.type, "str")
  assert.equal(
    question.default,
    "pt-BR",
    "o default tem que casar com o que todo filho já tem hardcoded — senão copier update muda string de filho existente (AD-034)"
  )
})

// LOC-01 — "language is configuration": pergunta travada num único valor não é seam, é
// decoração. Nenhum `choices` (ou tipo mais estreito que `str` livre) pode deixar pt-BR
// como única resposta possível.
test("product_locale is overridable — no choices lock it to pt-BR", () => {
  const question = copierYml().product_locale
  assert.equal(
    question.choices,
    undefined,
    "product_locale não pode ter `choices` — travaria todo produto em pt-BR"
  )
  assert.equal(question.type, "str", "tipo livre, não boolean/enum")
})

// TOOL-13 — F-copier-mechanics-4: verificado empiricamente com copier 9.17.2 — `_apply_update`
// chama `run_copy` (que roda `_tasks`) três vezes por `copier update`: old_copy, o destino real
// e new_copy. `_copier_operation` fica "update" nas três (contextvar setada uma vez só), então
// só `_copier_operation == 'copy'` filtra as descartáveis; `pretend` sozinho não bastava.
test("pnpm install still refuses to run under --pretend", () => {
  const task = copierYml()._tasks.find((t) =>
    t.command?.startsWith("pnpm install")
  )
  assert.ok(task, "copier.yml precisa da task `pnpm install`")
  assert.match(
    task.when,
    /not\s+_copier_conf\.pretend/,
    "a guarda de pretend não pode ter sido removida pela correção de _copier_operation"
  )
})

test("pnpm install and pnpm skills:sync are copy-only, like git init", () => {
  const tasks = copierYml()._tasks
  const install = tasks.find((t) => t.command?.startsWith("pnpm install"))
  const sync = tasks.find((t) => t.command === "pnpm skills:sync")
  const gitInit = tasks.find((t) => t.command === "git init -q")
  assert.ok(install && sync && gitInit)
  for (const task of [install, sync]) {
    assert.match(
      task.when,
      /_copier_operation\s*==\s*'copy'/,
      "sem essa guarda a task roda 3x por `copier update` (old_copy, destino real, new_copy) — só git init tinha a guarda"
    )
  }
  assert.equal(
    gitInit.when,
    install.when,
    "install e skills:sync devem reusar exatamente a mesma condição do git init"
  )
})

// RUN-03 — F-agnostic-leaks-5 / F-api-kernel-1: o passo 3 do _message_after_copy citava
// `pnpm --filter api db:bootstrap`, script que apps/api/package.json nunca definiu — o
// primeiro comando de onboarding falhava em todo produto gerado.
test("_message_after_copy names only pnpm commands that exist", () => {
  const message = copierYml()._message_after_copy
  const rootScripts = manifest("package.json").scripts
  const apiScripts = manifest("apps/api/package.json").scripts
  const commands = [
    ...message.matchAll(/pnpm(?: --filter api)? ([\w:-]+)/g),
  ].map((m) => ({ scoped: m[0].includes("--filter api"), script: m[1] }))
  assert.ok(
    commands.length > 0,
    "esperava pelo menos um comando pnpm na mensagem"
  )
  for (const { scoped, script } of commands) {
    if (script === "install") continue // pnpm install, não um script do manifest
    const scripts = scoped ? apiScripts : rootScripts
    assert.ok(
      script in scripts,
      `_message_after_copy cita "pnpm ${scoped ? "--filter api " : ""}${script}", que não existe no package.json ${scoped ? "de apps/api" : "raiz"}`
    )
  }
  assert.ok(
    !message.includes("db:bootstrap"),
    "db:bootstrap não existe em apps/api/package.json — não pode voltar à mensagem"
  )
})

// BRAND-08 — F-ci-docker-infra-5: feedback-triage.yml curlava um módulo de feedback,
// endpoints e docs que não existem em nenhum produto. "Ausência, não exclusão" (mesmo padrão
// do precedente catalog.yml, § 0.5): o arquivo não pode estar rastreado, e uma entrada em
// _exclude para um arquivo que nem existe não provaria nada.
test("feedback-triage.yml is gone — not tracked and not excluded", () => {
  assert.deepEqual(
    tracked(".github/workflows/feedback-triage.yml"),
    [],
    "feedback-triage.yml deveria ter sido removido — curla um módulo de feedback que não existe em catalog/"
  )
  assert.ok(
    !(copierYml()._exclude ?? []).includes(
      ".github/workflows/feedback-triage.yml"
    ),
    "copier.yml não deve excluir um arquivo que já nem existe"
  )
})

// RUN-03 (companion): o próprio comentário de bootstrap.product.ts já promete proteção via
// `_skip_if_exists` ("copier faz o produto sobrescrever este arquivo") — copier.yml precisa
// cumprir essa promessa, senão um `copier update` atropela a customização do produto.
test("bootstrap.product.ts is listed under _skip_if_exists", () => {
  const skip = copierYml()._skip_if_exists ?? []
  assert.ok(
    skip.includes("apps/api/src/bootstrap.product.ts"),
    "apps/api/src/bootstrap.product.ts precisa estar em _skip_if_exists — o comentário do próprio arquivo já promete isso"
  )
  assert.ok(
    tracked("apps/api/src/bootstrap.product.ts").length > 0,
    "o arquivo protegido precisa existir de verdade — _skip_if_exists para um caminho inexistente não prova nada"
  )
})
