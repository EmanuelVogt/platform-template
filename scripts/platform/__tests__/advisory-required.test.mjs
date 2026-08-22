import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAdvisoryRange, checkAdvisoryRequired } from "../advisory-required.mjs";

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

test("range: o trailer do último commit não isenta um commit anterior do mesmo PR", () => {
  const result = checkAdvisoryRange({
    commits: [
      {
        sha: "1111111111111111111111111111111111111111",
        files: ["catalog/identity/single-tenant/api/session.service.ts"],
        message: "feat(identity): ajusta expiração de sessão",
        advisories: [],
      },
      {
        sha: "2222222222222222222222222222222222222222",
        files: ["docs/dev/template.md"],
        message: "docs: nota\n\nAdvisory: none — só documentação",
        advisories: [],
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    { sha: "1111111111111111111111111111111111111111", missing: ["identity/single-tenant"] },
  ]);
});

test("range: cada commit é julgado pela própria mensagem e pelos próprios advisories", () => {
  const result = checkAdvisoryRange({
    commits: [
      {
        sha: "3333333333333333333333333333333333333333",
        files: ["catalog/tag/web/core/labels.ts", "docs/advisories/ADV-20260901-03.md"],
        message: "feat(tag): novo campo",
        advisories: [{ path: "docs/advisories/ADV-20260901-03.md", module: "tag" }],
      },
      {
        sha: "4444444444444444444444444444444444444444",
        files: ["catalog/audit/api/trail.service.ts"],
        message: "fix(audit): ajuste interno\n\nAdvisory: none — sem mudança de contrato",
        advisories: [],
      },
    ],
  });
  assert.equal(result.ok, true);
});

test("range: reprova cada commit que falha, não só o primeiro", () => {
  const result = checkAdvisoryRange({
    commits: [
      { sha: "aaaaaaaaaa", files: ["catalog/tag/api/tag.service.ts"], message: "feat(tag): a", advisories: [] },
      { sha: "bbbbbbbbbb", files: ["catalog/audit/api/trail.ts"], message: "feat(audit): b", advisories: [] },
    ],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    { sha: "aaaaaaaaaa", missing: ["tag"] },
    { sha: "bbbbbbbbbb", missing: ["audit"] },
  ]);
});

test("range vazio passa (PR sem commit que toque catalog/**)", () => {
  assert.deepEqual(checkAdvisoryRange({ commits: [] }), { ok: true });
});

test("resolve o nome real da entrada quando o próprio tier api aninha um segmento api (catalog/<entry>/api/api/**)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/notification/api/api/contracts/notification.contract.ts"],
    commitMessage: "feat(catalog/notification)!: specs on vitest — 2.0.0",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["notification"]);
});

test("resolve variante + tier api aninhado sem colidir com o segmento de variante (catalog/identity/single-tenant/api/api/**)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/identity/single-tenant/api/api/contracts/session.contract.ts"],
    commitMessage: "feat(identity): specs on vitest",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["identity/single-tenant"]);
});

test("reconhece tier web de uma entrada com variante (catalog/identity/single-tenant/web/**)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/identity/single-tenant/web/core/session.types.ts"],
    commitMessage: "feat(identity): ajusta tipos de sessão no client",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["identity/single-tenant"]);
});

test("ignora arquivo de catalog/** fora de um tier reconhecido (api|web|migrations|parity)", () => {
  const result = checkAdvisoryRequired({
    stagedFiles: ["catalog/notification/module.json"],
    commitMessage: "chore(catalog/notification): bump version",
    stagedAdvisories: [],
  });
  assert.equal(result.ok, true);
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
