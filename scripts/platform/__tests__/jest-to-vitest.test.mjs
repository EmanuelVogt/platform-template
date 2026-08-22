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
    `import { vi } from "vitest"\n\nconst spy = vi.spyOn(obj, "method")\nconst mocked = vi.fn(() => 1)\nvi.mock("./dep")`,
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
    `import { vi } from "vitest"\n\nconst factory = async () => {\n  const actual = await vi.importActual("./dep")\n  return actual\n}`,
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
  assert.equal(text, `import { vi } from "vitest"\n\nvi.setConfig({ testTimeout: 30000 })`);
  assert.equal(changed, true);
  assert.deepEqual(manualReview, []);
});

test("rule 4 — tipos jest.Mock/jest.SpyInstance viram o nome nu e entram como type import", () => {
  const input = `const spy: jest.SpyInstance = jest.fn()`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(text, `import { type MockInstance, vi } from "vitest"\n\nconst spy: MockInstance = vi.fn()`);
  assert.equal(changed, true);
  assert.deepEqual(manualReview, []);
});

test("rule 5 — factory de jest.mock que fecha sobre um const top-level vira vi.hoisted (forma do traced.decorator.spec.ts:20)", () => {
  const input = `import * as OtelApi from "@opentelemetry/api"

const mockSpan = {
  recordException: jest.fn(),
  setStatus: jest.fn(),
  end: jest.fn(),
}

jest.mock("@opentelemetry/api", () => {
  const actual = jest.requireActual<typeof OtelApi>("@opentelemetry/api")
  return Object.assign({}, actual, {
    trace: Object.assign({}, actual.trace, {
      getTracer: () => ({
        startActiveSpan: (_name: string, fn: (span: unknown) => unknown) =>
          fn(mockSpan),
      }),
    }),
  })
})`;
  const expected = `import * as OtelApi from "@opentelemetry/api"
import { vi } from "vitest"

const { mockSpan } = vi.hoisted(() => {
  const mockSpan = {
  recordException: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
}
  return { mockSpan }
})

vi.mock("@opentelemetry/api", async () => {
  const actual = await vi.importActual<typeof OtelApi>("@opentelemetry/api")
  return Object.assign({}, actual, {
    trace: Object.assign({}, actual.trace, {
      getTracer: () => ({
        startActiveSpan: (_name: string, fn: (span: unknown) => unknown) =>
          fn(mockSpan),
      }),
    }),
  })
})`;
  const { text, changed, manualReview } = transformSource(input, "traced.decorator.spec.ts");
  assert.equal(text, expected);
  assert.equal(changed, true);
  assert.deepEqual(manualReview, []);
});

test("rule 6 — import existente de vitest é estendido, nunca duplicado", () => {
  const input = `import { describe, it } from "vitest"

describe("thing", () => {
  it("does it", () => {
    const spy = jest.fn()
    expect(spy).toBeDefined()
  })
})`;
  const expected = `import { describe, expect, it, vi } from "vitest"

describe("thing", () => {
  it("does it", () => {
    const spy = vi.fn()
    expect(spy).toBeDefined()
  })
})`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(text, expected);
  assert.equal(changed, true);
  assert.deepEqual(manualReview, []);
});

test("it.each/describe.each passam intocados quando o arquivo já não usa jest.*", () => {
  const input = `import { describe, expect, it } from "vitest"

describe.each([1, 2])("case %s", (value) => {
  it.each([
    [1, 1],
    [2, 4],
  ])("doubles %i to %i", (input, output) => {
    expect(input * 2).toBe(output)
  })
})`;
  const { text, changed, manualReview } = transformSource(input, "sample.spec.ts");
  assert.equal(text, input);
  assert.equal(changed, false);
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
