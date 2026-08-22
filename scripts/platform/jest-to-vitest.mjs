#!/usr/bin/env node
// Uso: node scripts/platform/jest-to-vitest.mjs <path…> [--check] [--quiet]
// Reescreve specs Jest para Vitest na árvore indicada (regras 1-6 de
// design.md § Codemod). `--check` não escreve nada e sai 1 se algum arquivo
// mudaria ou carrega um site de revisão manual; `--quiet` mantém só o resumo.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const TEST_FILE_RE = /\.(spec|int-spec|e2e-spec|test)\.tsx?$/;
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".catalog-stage"]);

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
]);

function scriptKindFor(fileName) {
  return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function isJestCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "jest"
  );
}

function findEnclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isAlreadyAsync(fn) {
  return (fn.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
}

// Rules 1-3: chamadas `jest.<m>(...)`. Um membro fora da lista conhecida e fora das
// regras 2/3 nunca é reescrito — só entra no relatório de revisão manual.
function visitJestCalls(node, sourceFile, edits, manualReview, state) {
  if (isJestCall(node)) {
    const callee = node.expression;
    const member = callee.name.text;
    if (member === "requireActual" || member === "requireMock") {
      const enclosing = findEnclosingFunction(node);
      if (!enclosing) {
        manualReview.push({
          line: lineOf(sourceFile, node.getStart(sourceFile)),
          message: `manual review: jest.${member} sem função envolvente`,
        });
      } else {
        const target = member === "requireActual" ? "importActual" : "importMock";
        edits.push({ start: callee.getStart(sourceFile), end: callee.getEnd(), text: `await vi.${target}` });
        state.usesVi = true;
        if (!isAlreadyAsync(enclosing) && !state.asyncified.has(enclosing)) {
          state.asyncified.add(enclosing);
          edits.push({ start: enclosing.getStart(sourceFile), end: enclosing.getStart(sourceFile), text: "async " });
        }
      }
    } else if (member === "setTimeout") {
      const arg = node.arguments[0];
      const argText = arg ? arg.getText(sourceFile) : "";
      edits.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        text: `vi.setConfig({ testTimeout: ${argText} })`,
      });
      state.usesVi = true;
    } else if (RENAMED_MEMBERS.has(member)) {
      edits.push({ start: callee.expression.getStart(sourceFile), end: callee.expression.getEnd(), text: "vi" });
      state.usesVi = true;
    } else {
      manualReview.push({
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        message: `manual review: membro não mapeado jest.${member}`,
      });
    }
  }
  ts.forEachChild(node, (child) => visitJestCalls(child, sourceFile, edits, manualReview, state));
}

function transformSource(sourceText, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
  const edits = [];
  const manualReview = [];
  const state = { usesVi: false, asyncified: new Set() };

  visitJestCalls(sourceFile, sourceFile, edits, manualReview, state);

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let text = sourceText;
  for (const edit of edits) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }

  return { text, changed: text !== sourceText, manualReview };
}

function walkFiles(root) {
  const stats = statSync(root);
  if (stats.isFile()) {
    return TEST_FILE_RE.test(root) ? [root] : [];
  }
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (TEST_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function collectFiles(paths) {
  const files = [];
  for (const requestedPath of paths) files.push(...walkFiles(requestedPath));
  return files;
}

function runCodemod(paths, { check = false } = {}) {
  const files = collectFiles(paths);
  const rewritten = [];
  const unchanged = [];
  const manualReviewByFile = [];
  for (const file of files) {
    const original = readFileSync(file, "utf8");
    const { text, changed, manualReview } = transformSource(original, file);
    if (changed) rewritten.push(file);
    else unchanged.push(file);
    if (manualReview.length > 0) manualReviewByFile.push({ file, sites: manualReview });
    if (changed && !check) writeFileSync(file, text);
  }
  const hasManualReview = manualReviewByFile.length > 0;
  const exitCode = check && (rewritten.length > 0 || hasManualReview) ? 1 : 0;
  return { files, rewritten, unchanged, manualReview: manualReviewByFile, exitCode };
}

function parseArgv(argv) {
  const check = argv.includes("--check");
  const quiet = argv.includes("--quiet");
  const paths = argv.filter((arg) => arg !== "--check" && arg !== "--quiet");
  return { paths, check, quiet };
}

function printReport(result, { quiet }) {
  if (!quiet) {
    for (const file of result.rewritten) console.log(`changed: ${file}`);
    for (const { file, sites } of result.manualReview) {
      for (const site of sites) console.log(`${file}:${site.line} — ${site.message}`);
    }
  }
  console.log(
    `jest-to-vitest — ${result.rewritten.length} alterado(s), ${result.unchanged.length} inalterado(s), ${result.manualReview.length} com revisão manual`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { paths, check, quiet } = parseArgv(process.argv.slice(2));
  const result = runCodemod(paths, { check });
  printReport(result, { quiet });
  process.exit(result.exitCode);
}

export { collectFiles, parseArgv, runCodemod, transformSource, walkFiles };
