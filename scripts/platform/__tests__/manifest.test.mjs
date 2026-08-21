import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ManifestValidationError, readManifest, validateManifest } from "../lib/manifest.mjs";

const VALID_MANIFEST = {
  name: "identity",
  variant: "single-tenant",
  version: "1.0.0",
  description: "identidade e sessão",
  kernelRange: ">=1.0.0 <2.0.0",
  dependsOn: [{ name: "attachment", range: "^1.0.0" }],
  apiModule: { export: "IdentityModule", path: "modules/identity/identity.module" },
  schemaExports: ["modules/identity/infrastructure/tables/users.table"],
  customMigrations: ["01_auth_events_append_only.sql"],
  env: [{ name: "IDENTITY_SESSION_TTL_SECONDS", example: "86400", required: false, doc: "ttl da sessão" }],
  web: { defaultRoot: "apps/web/src/entities/identity", react: true },
  absorbs: ["#4", "#7"],
};

test("validateManifest aceita um manifesto válido completo", () => {
  assert.deepEqual(validateManifest(VALID_MANIFEST), VALID_MANIFEST);
});

test("validateManifest rejeita manifesto sem name/version/kernelRange", () => {
  const { name, version, kernelRange, ...rest } = VALID_MANIFEST;
  try {
    validateManifest(rest);
    assert.fail("deveria ter lançado ManifestValidationError");
  } catch (err) {
    assert.ok(err instanceof ManifestValidationError);
    assert.ok(err.errors.some((e) => e.includes("name")));
    assert.ok(err.errors.some((e) => e.includes("version")));
    assert.ok(err.errors.some((e) => e.includes("kernelRange")));
  }
});

test("validateManifest rejeita version com semver inválido", () => {
  const manifest = { ...VALID_MANIFEST, version: "not-a-version" };
  assert.throws(() => validateManifest(manifest), ManifestValidationError);
});

test("validateManifest rejeita kernelRange com semver range inválido", () => {
  const manifest = { ...VALID_MANIFEST, kernelRange: "not-a-range" };
  assert.throws(() => validateManifest(manifest), ManifestValidationError);
});

test("validateManifest rejeita campo desconhecido", () => {
  const manifest = { ...VALID_MANIFEST, unknownField: "boom" };
  try {
    validateManifest(manifest);
    assert.fail("deveria ter lançado ManifestValidationError");
  } catch (err) {
    assert.ok(err instanceof ManifestValidationError);
    assert.ok(err.errors.some((e) => e.includes("unknownField")));
  }
});

test("validateManifest rejeita dependsOn com range inválido", () => {
  const manifest = { ...VALID_MANIFEST, dependsOn: [{ name: "attachment", range: "not-a-range" }] };
  assert.throws(() => validateManifest(manifest), ManifestValidationError);
});

test("readManifest lê e valida um module.json do disco", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "manifest-test-"));
  const filePath = path.join(dir, "module.json");
  writeFileSync(filePath, JSON.stringify(VALID_MANIFEST), "utf8");
  assert.deepEqual(readManifest(filePath), VALID_MANIFEST);
});
