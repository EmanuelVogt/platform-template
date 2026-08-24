#!/usr/bin/env node
// Uso: node scripts/platform/jest-to-vitest.mjs <path…> [--check] [--quiet]
// Reescreve specs Jest para Vitest na árvore indicada (regras 1-6 de
// design.md § Codemod). `--check` não escreve nada e sai 1 se algum arquivo
// mudaria ou carrega um site de revisão manual; `--quiet` mantém só o resumo.
// Comando do child na migração (spec P1-catalog AC6):
//   node scripts/platform/jest-to-vitest.mjs apps/api/src apps/web/src

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { isMain } from "./lib/is-main.mjs"

const TEST_FILE_RE = /\.(spec|int-spec|e2e-spec|test)\.tsx?$/
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".catalog-stage"])

// Membros de `jest.<m>` que só trocam o objeto base — o nome do método é o mesmo em `vi`.
const RENAMED_MEMBERS = new Set([
  "fn",
  "spyOn",
  "mock",
  "unmock",
  "doMock",
  "mocked",
  "restoreAllMocks",
  "resetAllMocks",
  "clearAllMocks",
  "useFakeTimers",
  "useRealTimers",
  "advanceTimersByTime",
  "advanceTimersByTimeAsync",
  "runAllTimers",
  "runOnlyPendingTimers",
  "setSystemTime",
  "getRealSystemTime",
  "isMockFunction",
  "resetModules",
])

// Rule 4: tipos `jest.<X>` viram o nome nu importado de "vitest"; SpyInstance
// não existe mais em Vitest — o substituto é MockInstance.
const TYPE_RENAMES = {
  Mock: "Mock",
  Mocked: "Mocked",
  MockedFunction: "MockedFunction",
  MockedClass: "MockedClass",
  SpyInstance: "MockInstance",
}

const TEST_GLOBALS = [
  "describe",
  "it",
  "test",
  "expect",
  "beforeAll",
  "beforeEach",
  "afterAll",
  "afterEach",
]

function scriptKindFor(fileName) {
  return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1
}

function isJestCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "jest"
  )
}

function findEnclosingFunction(node) {
  let current = node.parent
  while (current) {
    if (
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current
    }
    current = current.parent
  }
  return null
}

function isAlreadyAsync(fn) {
  return (fn.modifiers ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
  )
}

// Rule 4: referências de tipo `jest.Mock` / `jest.Mocked` / etc.
function visitTypeReferences(node, sourceFile, edits, state) {
  if (
    ts.isTypeReferenceNode(node) &&
    ts.isQualifiedName(node.typeName) &&
    ts.isIdentifier(node.typeName.left) &&
    node.typeName.left.text === "jest"
  ) {
    const renamed = TYPE_RENAMES[node.typeName.right.text]
    if (renamed) {
      edits.push({
        start: node.typeName.getStart(sourceFile),
        end: node.typeName.getEnd(),
        text: renamed,
      })
      state.usedTypeNames.add(renamed)
    }
  }
  ts.forEachChild(node, (child) =>
    visitTypeReferences(child, sourceFile, edits, state)
  )
}

function collectImportNames(importClause, names) {
  if (importClause.name) names.add(importClause.name.text)
  const bindings = importClause.namedBindings
  if (!bindings) return
  if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text)
  else if (ts.isNamedImports(bindings))
    for (const element of bindings.elements) names.add(element.name.text)
}

// Bindings top-level elegíveis para `vi.hoisted` (um único `const`/`let` por
// statement) vs. os que só entram no relatório de revisão manual se uma
// factory de `jest.mock` fechar sobre eles (var/function/import — o hoist do
// Vitest sobe `vi.mock` acima dos imports, então não dá pra fechar sobre eles).
function collectTopLevelBindings(sourceFile) {
  const hoistable = new Map()
  const other = new Set()
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const flags = statement.declarationList.flags
      const isConstOrLet =
        (flags & ts.NodeFlags.Const) !== 0 || (flags & ts.NodeFlags.Let) !== 0
      const single = statement.declarationList.declarations.length === 1
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        if (isConstOrLet && single)
          hoistable.set(declaration.name.text, statement)
        else other.add(declaration.name.text)
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      other.add(statement.name.text)
    } else if (ts.isImportDeclaration(statement) && statement.importClause) {
      collectImportNames(statement.importClause, other)
    }
  }
  return { hoistable, other }
}

function collectRuntimeIdentifiers(node, names) {
  if (ts.isTypeNode(node)) return
  if (ts.isIdentifier(node)) names.add(node.text)
  ts.forEachChild(node, (child) => collectRuntimeIdentifiers(child, names))
}

// Rule 5: `jest.mock(path, factory)` cuja factory referencia um `const`/`let`
// top-level do arquivo — a declaração vira `const { name } = vi.hoisted(...)`
// envolvendo o statement original (edits de abertura/fechamento, não um
// replace do range inteiro — assim as regras 1-3 já aplicadas no interior,
// como `jest.fn()` -> `vi.fn()`, compõem sem conflito de range).
function visitMockFactories(
  node,
  sourceFile,
  edits,
  manualReview,
  state,
  bindings
) {
  if (
    isJestCall(node) &&
    node.expression.name.text === "mock" &&
    node.arguments.length >= 2 &&
    (ts.isArrowFunction(node.arguments[1]) ||
      ts.isFunctionExpression(node.arguments[1]))
  ) {
    const factory = node.arguments[1]
    const referenced = new Set()
    collectRuntimeIdentifiers(factory.body, referenced)
    for (const name of referenced) {
      if (bindings.hoistable.has(name) && !state.hoisted.has(name)) {
        state.hoisted.add(name)
        const statement = bindings.hoistable.get(name)
        edits.push({
          start: statement.getStart(sourceFile),
          end: statement.getStart(sourceFile),
          text: `const { ${name} } = vi.hoisted(() => {\n  `,
        })
        edits.push({
          start: statement.getEnd(),
          end: statement.getEnd(),
          text: `\n  return { ${name} }\n})`,
        })
        state.usesVi = true
      } else if (bindings.other.has(name) && !state.flaggedClosures.has(name)) {
        state.flaggedClosures.add(name)
        manualReview.push({
          line: lineOf(sourceFile, factory.getStart(sourceFile)),
          message: `manual review: factory de vi.mock fecha sobre ${name}`,
        })
      }
    }
  }
  ts.forEachChild(node, (child) =>
    visitMockFactories(child, sourceFile, edits, manualReview, state, bindings)
  )
}

function isDeclarationName(node) {
  const parent = node.parent
  if (!parent) return false
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isBindingElement(parent) ||
      ts.isParameter(parent)) &&
    parent.name === node
  ) {
    return true
  }
  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isFunctionExpression(parent)) &&
    parent.name === node
  ) {
    return true
  }
  if (
    (ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent)) &&
    (parent.name === node || parent.propertyName === node)
  ) {
    return true
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent)) &&
    parent.name === node
  ) {
    return true
  }
  return false
}

// Rule 6: identificadores livres dos globais de teste, usados como valor (não
// declarados/importados no arquivo), viram o import único de "vitest".
function collectUsedGlobals(sourceFile) {
  const used = new Set()
  function visit(node) {
    if (ts.isTypeNode(node)) return
    if (
      ts.isIdentifier(node) &&
      TEST_GLOBALS.includes(node.text) &&
      !isDeclarationName(node)
    )
      used.add(node.text)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return used
}

function findVitestImport(sourceFile) {
  return sourceFile.statements.find(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "vitest" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
  )
}

function extendVitestImportNames(existingImport, valueNames, typeNames) {
  for (const element of existingImport.importClause.namedBindings.elements) {
    if (element.isTypeOnly) typeNames.add(element.name.text)
    else valueNames.add(element.name.text)
  }
}

function buildImportSpecifiers(valueNames, typeNames) {
  const items = [
    ...[...valueNames].map((name) => ({ name, text: name })),
    ...[...typeNames]
      .filter((name) => !valueNames.has(name))
      .map((name) => ({ name, text: `type ${name}` })),
  ]
  items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return items.map((item) => item.text).join(", ")
}

// Rules 1-3: chamadas `jest.<m>(...)`. Um membro fora da lista conhecida e fora das
// regras 2/3 nunca é reescrito — só entra no relatório de revisão manual.
function visitJestCalls(node, sourceFile, edits, manualReview, state) {
  if (isJestCall(node)) {
    const callee = node.expression
    const member = callee.name.text
    if (member === "requireActual" || member === "requireMock") {
      const enclosing = findEnclosingFunction(node)
      if (!enclosing) {
        manualReview.push({
          line: lineOf(sourceFile, node.getStart(sourceFile)),
          message: `manual review: jest.${member} sem função envolvente`,
        })
      } else {
        const target =
          member === "requireActual" ? "importActual" : "importMock"
        edits.push({
          start: callee.getStart(sourceFile),
          end: callee.getEnd(),
          text: `await vi.${target}`,
        })
        state.usesVi = true
        if (!isAlreadyAsync(enclosing) && !state.asyncified.has(enclosing)) {
          state.asyncified.add(enclosing)
          edits.push({
            start: enclosing.getStart(sourceFile),
            end: enclosing.getStart(sourceFile),
            text: "async ",
          })
        }
      }
    } else if (member === "setTimeout") {
      const arg = node.arguments[0]
      const argText = arg ? arg.getText(sourceFile) : ""
      edits.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        text: `vi.setConfig({ testTimeout: ${argText} })`,
      })
      state.usesVi = true
    } else if (RENAMED_MEMBERS.has(member)) {
      edits.push({
        start: callee.expression.getStart(sourceFile),
        end: callee.expression.getEnd(),
        text: "vi",
      })
      state.usesVi = true
    } else {
      manualReview.push({
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        message: `manual review: membro não mapeado jest.${member}`,
      })
    }
  }
  ts.forEachChild(node, (child) =>
    visitJestCalls(child, sourceFile, edits, manualReview, state)
  )
}

function transformSource(sourceText, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName)
  )
  const edits = []
  const manualReview = []
  const state = {
    usesVi: false,
    asyncified: new Set(),
    usedTypeNames: new Set(),
    hoisted: new Set(),
    flaggedClosures: new Set(),
  }

  visitJestCalls(sourceFile, sourceFile, edits, manualReview, state)
  visitTypeReferences(sourceFile, sourceFile, edits, state)
  visitMockFactories(
    sourceFile,
    sourceFile,
    edits,
    manualReview,
    state,
    collectTopLevelBindings(sourceFile)
  )

  const valueNames = collectUsedGlobals(sourceFile)
  if (state.usesVi) valueNames.add("vi")
  const typeNames = new Set(state.usedTypeNames)

  const existingImport = findVitestImport(sourceFile)
  if (existingImport) {
    extendVitestImportNames(existingImport, valueNames, typeNames)
    edits.push({
      start: existingImport.getStart(sourceFile),
      end: existingImport.getEnd(),
      text: `import { ${buildImportSpecifiers(valueNames, typeNames)} } from "vitest"`,
    })
  } else if (valueNames.size > 0 || typeNames.size > 0) {
    const importLine = `import { ${buildImportSpecifiers(valueNames, typeNames)} } from "vitest"`
    const lastImport = [...sourceFile.statements]
      .reverse()
      .find((statement) => ts.isImportDeclaration(statement))
    if (lastImport) {
      edits.push({
        start: lastImport.getEnd(),
        end: lastImport.getEnd(),
        text: `\n${importLine}`,
      })
    } else {
      edits.push({ start: 0, end: 0, text: `${importLine}\n\n` })
    }
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let text = sourceText
  for (const edit of edits) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
  }

  return { text, changed: text !== sourceText, manualReview }
}

function walkFiles(root) {
  const stats = statSync(root)
  if (stats.isFile()) {
    return TEST_FILE_RE.test(root) ? [root] : []
  }
  const out = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkFiles(full))
    } else if (TEST_FILE_RE.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function collectFiles(paths) {
  const files = []
  for (const requestedPath of paths) files.push(...walkFiles(requestedPath))
  return files
}

function runCodemod(paths, { check = false } = {}) {
  const files = collectFiles(paths)
  const rewritten = []
  const unchanged = []
  const manualReviewByFile = []
  for (const file of files) {
    const original = readFileSync(file, "utf8")
    const { text, changed, manualReview } = transformSource(original, file)
    if (changed) rewritten.push(file)
    else unchanged.push(file)
    if (manualReview.length > 0)
      manualReviewByFile.push({ file, sites: manualReview })
    if (changed && !check) writeFileSync(file, text)
  }
  const hasManualReview = manualReviewByFile.length > 0
  const exitCode = check && (rewritten.length > 0 || hasManualReview) ? 1 : 0
  return {
    files,
    rewritten,
    unchanged,
    manualReview: manualReviewByFile,
    exitCode,
  }
}

function parseArgv(argv) {
  const check = argv.includes("--check")
  const quiet = argv.includes("--quiet")
  const paths = argv.filter((arg) => arg !== "--check" && arg !== "--quiet")
  return { paths, check, quiet }
}

function printReport(
  result,
  { quiet, log = (line) => process.stdout.write(`${line}\n`) } = {}
) {
  if (!quiet) {
    for (const file of result.rewritten) log(`changed: ${file}`)
    for (const { file, sites } of result.manualReview) {
      for (const site of sites) log(`${file}:${site.line} — ${site.message}`)
    }
  }
  log(
    `jest-to-vitest — ${result.rewritten.length} alterado(s), ${result.unchanged.length} inalterado(s), ${result.manualReview.length} com revisão manual`
  )
}

if (isMain(import.meta.url, process.argv[1])) {
  const { paths, check, quiet } = parseArgv(process.argv.slice(2))
  const result = runCodemod(paths, { check })
  printReport(result, { quiet })
  process.exit(result.exitCode)
}

export {
  collectFiles,
  parseArgv,
  printReport,
  runCodemod,
  transformSource,
  walkFiles,
}
