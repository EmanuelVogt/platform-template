import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAdvisoryRequired } from "../advisory-required.mjs";

test("rejeita mudança de código do catálogo sem advisory staged (exit esperado: 1)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/identity/single-tenant/api/session.service.ts"],
    commitMessage: "feat(identity): ajusta expiração de sessão",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["identity/single-tenant"]);
});

test("aceita quando há um ADV staged com module correspondente (exit esperado: 0)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/identity/single-tenant/api/session.service.ts", "docs/advisories/ADV-20260901-01.md"],
    commitMessage: "feat(identity): ajusta expiração de sessão",
    stagedAdvisories: [{ path: "docs/advisories/ADV-20260901-01.md", module: "identity/single-tenant" }],
  });
  assert.equal(result.ok, true);
});

test("aceita mudança que só toca docs/testes fora de catalog/** (exit esperado: 0)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["docs/catalog/README.md", "apps/api/src/modules/identity/identity.service.spec.ts"],
    commitMessage: "test(identity): cobre expiração de sessão",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, true);
});

test("aceita mudança de código do catálogo sem ADV quando a mensagem carrega o trailer Advisory: none (exit esperado: 0)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/identity/single-tenant/api/session.service.ts"],
    commitMessage:
      "fix(identity): ajusta timeout interno\n\nAdvisory: none — ajuste de performance, sem mudança de contrato",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, true);
});

test("rejeita quando o ADV staged é de outro module (exit esperado: 1)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/identity/single-tenant/api/session.service.ts", "docs/advisories/ADV-20260901-02.md"],
    commitMessage: "feat(identity): ajusta expiração de sessão",
    stagedAdvisories: [{ path: "docs/advisories/ADV-20260901-02.md", module: "attachment/single-tenant" }],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["identity/single-tenant"]);
});

test("reconhece entradas sem variant (catalog/<name>/(api|web|migrations|parity)/**)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/tag/web/core/labels.ts"],
    commitMessage: "feat(tag): novo campo",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["tag"]);
});

test("cobre apenas as entradas sem ADV quando várias entradas são tocadas na mesma mudança", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: [
      "catalog/identity/single-tenant/api/session.service.ts",
      "catalog/tag/migrations/custom/01_index.sql",
      "docs/advisories/ADV-20260901-01.md",
    ],
    commitMessage: "feat(identity): ajusta expiração de sessão",
    stagedAdvisories: [{ path: "docs/advisories/ADV-20260901-01.md", module: "identity/single-tenant" }],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["tag"]);
});
