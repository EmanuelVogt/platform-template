#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname, resolve, basename } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const generatedRoot = join(repoRoot, "packages", "api-client", "generated")
const webRoot = join(repoRoot, "apps", "web", "src")

// Sufixos que o Kubb costura no nome do arquivo gerado. Removidos para achar o
// operationId por trás: useCreateReservationSuspense -> createReservation.
const fileAffixes = [/^use/i, /suspense$/i, /schema$/i, /dto$/i]

const listOperations = () => {
  const doc = JSON.parse(readFileSync(join(repoRoot, "openapi.json"), "utf8"))
  const operations = new Map()

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (operation?.operationId) {
        operations.set(operation.operationId, {
          method: method.toUpperCase(),
          path,
        })
      }
    }
  }

  return operations
}

const listGeneratedFiles = () =>
  ["hooks", "models", "zod"]
    .filter((segment) => existsSync(join(generatedRoot, segment)))
    .flatMap((segment) =>
      readdirSync(join(generatedRoot, segment))
        .filter((name) => name.endsWith(".ts") && name !== "index.ts")
        .map((name) => join(generatedRoot, segment, name))
    )

// Um arquivo gerado pertence à operação cujo id é o prefixo mais longo do nome —
// senão `createReservation` roubaria os artefatos de `createReservationHold`.
const matchOperation = (fileName, operationIds) => {
  let stem = basename(fileName, ".ts")
  for (const affix of fileAffixes) stem = stem.replace(affix, "")

  return operationIds
    .filter((id) => stem.toLowerCase().startsWith(id.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0]
}

const exportedSymbols = (source) =>
  [
    ...source.matchAll(
      /export (?:declare )?(?:const|function|type|interface|class) (\w+)/g
    ),
  ].map((match) => match[1])

// Indexa por símbolo, não por arquivo: a regra de "sem barrel" garante que o front
// importa direto do arquivo que define, então o símbolo é o que aparece na tela.
const buildSymbolIndex = (operations) => {
  const operationIds = [...operations.keys()]
  const index = new Map()

  for (const file of listGeneratedFiles()) {
    const operationId = matchOperation(file, operationIds)
    if (!operationId) continue

    for (const symbol of exportedSymbols(readFileSync(file, "utf8"))) {
      index.set(symbol, operationId)
    }
  }

  return index
}

const listWebFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listWebFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// Só conta quem importa do api-client: sem esse filtro, um identificador citado
// em comentário viraria consumidor de contrato.
const buildConsumerMap = (symbolIndex) => {
  const consumers = new Map()

  for (const file of listWebFiles(webRoot)) {
    const source = readFileSync(file, "utf8")
    if (!source.includes("@platform/api-client")) continue

    const relative = file.slice(repoRoot.length + 1)
    for (const token of new Set(source.match(/\b\w+\b/g) ?? [])) {
      const operationId = symbolIndex.get(token)
      if (!operationId) continue
      if (!consumers.has(operationId)) consumers.set(operationId, new Set())
      consumers.get(operationId).add(relative)
    }
  }

  return consumers
}

// Um DTO do contrato do api tem o mesmo nome do model gerado pelo Kubb, então o
// cruzamento de símbolos diz quais operações um arquivo de contrato mexe.
const operationsOfFile = (file, symbolIndex) => {
  const source = readFileSync(file, "utf8")
  const found = new Set()

  for (const token of new Set(source.match(/\b\w+\b/g) ?? [])) {
    const operationId = symbolIndex.get(token)
    if (operationId) found.add(operationId)
  }

  return found
}

const operations = listOperations()
const symbolIndex = buildSymbolIndex(operations)
const consumers = buildConsumerMap(symbolIndex)

const args = process.argv.slice(2)
const forFile = args.includes("--for-file")
  ? args[args.indexOf("--for-file") + 1]
  : null
const term = args.find((arg) => !arg.startsWith("--") && arg !== forFile)
const asJson = args.includes("--json")

if (forFile) {
  const touched = [...operationsOfFile(forFile, symbolIndex)]
  const affected = touched
    .map((id) => ({ id, files: [...(consumers.get(id) ?? [])].sort() }))
    .filter((entry) => entry.files.length > 0)

  if (affected.length === 0) process.exit(0)

  for (const { id, files } of affected) {
    console.log(
      `${id}  [${operations.get(id).method} ${operations.get(id).path}]`
    )
    for (const file of files) console.log(`  ${file}`)
  }
  process.exit(0)
}

const selected = [...operations.entries()].filter(
  ([id, { path }]) =>
    !term ||
    id.toLowerCase().includes(term.toLowerCase()) ||
    path.includes(term)
)

if (asJson) {
  const payload = selected.map(([id, meta]) => ({
    operationId: id,
    ...meta,
    consumers: [...(consumers.get(id) ?? [])].sort(),
  }))
  console.log(JSON.stringify(payload, null, 2))
  process.exit(0)
}

if (term && selected.length === 0) {
  console.error(`Nenhuma operação do contrato casa com "${term}".`)
  process.exit(1)
}

if (term) {
  for (const [id, { method, path }] of selected) {
    const files = [...(consumers.get(id) ?? [])].sort()
    console.log(`\n${id}  [${method} ${path}]`)
    if (files.length === 0) console.log("  (nada no front toca esta operação)")
    for (const file of files) console.log(`  ${file}`)
  }
  console.log("\nPontos de contato direto; o resto cai no turbo typecheck.")
  process.exit(0)
}

const orphans = selected.filter(([id]) => !consumers.has(id))

console.log(`Operações no contrato: ${operations.size}`)
console.log(`Consumidas pelo front: ${operations.size - orphans.length}`)
console.log(`Sem nenhum consumidor:  ${orphans.length}`)

if (orphans.length > 0) {
  console.log("\nOperações que nenhuma tela consome:")
  for (const [id, { method, path }] of orphans)
    console.log(`  ${id}  [${method} ${path}]`)
}

console.log("\nUma operação: pnpm contract:consumers <operationId|rota>")
