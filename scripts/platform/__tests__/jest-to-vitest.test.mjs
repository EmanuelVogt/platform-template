import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCodemod, transformSource } from "../jest-to-vitest.mjs";

test("rule 1 — jest.fn/mock/spyOn vira vi.<mesmo nome> mantendo os argumentos", () => {
  const input = `const spy = jest.spyOn(obj, "method")\nconst mocked = jest.fn(() => 1)\njest.mock("./dep")`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(
    text,
    `const spy = vi.spyOn(obj, "method")\nconst mocked = vi.fn(() => 1)\nvi.mock("./dep")`,
  );
  assert.equal(changed, true);
  assert.deepEqual(manualReview, []);
});

test("rule 1 — membro fora da lista conhecida nunca é reescrito, só reportado", () => {
  const input = `jest.advanceTimersToNextTimer()`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(text, input);
  assert.equal(changed, false);
  assert.equal(manualReview.length, 1);
  assert.match(manualReview[0].message, /membro não mapeado jest\.advanceTimersToNextTimer/);
  assert.equal(manualReview[0].line, 1);
});

test("rule 2 — jest.requireActual dentro de uma factory vira await vi.importActual e a factory ganha async", () => {
  const input = `const factory = () => {\n  const actual = jest.requireActual("./dep")\n  return actual\n}`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(
    text,
    `const factory = async () => {\n  const actual = await vi.importActual("./dep")\n  return actual\n}`,
  );
  assert.equal(changed, true);
  assert.deepEqual(manualReview, []);
});

test("rule 2 — jest.requireMock sem função envolvente é reportado e deixado intocado", () => {
  const input = `const actual = jest.requireMock("./dep")`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(text, input);
  assert.equal(changed, false);
  assert.equal(manualReview.length, 1);
  assert.match(manualReview[0].message, /jest\.requireMock sem função envolvente/);
});

test("rule 3 — jest.setTimeout(n) vira vi.setConfig({ testTimeout: n })", () => {
  const input = `jest.setTimeout(30000)`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(text, `vi.setConfig({ testTimeout: 30000 })`);
  assert.equal(changed, true);
  assert.deepEqual(manualReview, []);
});

test("runCodemod caminha o diretório, aplica as regras 1-3 e escreve os arquivos alterados", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "jest-to-vitest-"));
  try {
    const specPath = path.join(dir, "sample.spec.ts");
    const prodPath = path.join(dir, "sample.ts");
    writeFileSync(specPath, `jest.fn()\n`);
    writeFileSync(prodPath, `export const x = 1\n`);

    const result = runCodemod([dir]);

    assert.deepEqual(result.files.sort(), [specPath].sort());
    assert.deepEqual(result.rewritten, [specPath]);
    assert.deepEqual(result.unchanged, []);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
