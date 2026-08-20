import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CatalogUnreachableError, defaultCatalogRef, isGitRef, resolveCatalog, splitCatalogRef } from "../lib/catalog-source.mjs";

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function makeBareOriginWithCatalog() {
  const workDir = mkdtempSync(path.join(tmpdir(), "catalog-origin-"));
  mkdirSync(path.join(workDir, "catalog", "alpha"), { recursive: true });
  writeFileSync(
    path.join(workDir, "catalog", "alpha", "module.json"),
    JSON.stringify({ name: "alpha", version: "1.0.0", kernelRange: ">=1.0.0 <2.0.0" }),
    "utf8",
  );
  git(["init", "-q"], workDir);
  git(["-c", "user.email=test@test.local", "-c", "user.name=test", "add", "."], workDir);
  git(["-c", "user.email=test@test.local", "-c", "user.name=test", "commit", "-q", "-m", "init"], workDir);

  const bareDir = `${workDir}.git`;
  git(["clone", "-q", "--bare", workDir, bareDir]);
  return bareDir;
}

test("resolveCatalog aceita um caminho local existente", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "catalog-local-"));
  const result = resolveCatalog(dir);
  assert.deepEqual(result, { kind: "local", root: dir, ref: dir });
});

test("resolveCatalog lança CatalogUnreachableError para caminho local inexistente", () => {
  const missing = path.join(tmpdir(), "catalog-local-nao-existe-xyz");
  assert.throws(() => resolveCatalog(missing), CatalogUnreachableError);
});

test("resolveCatalog lança CatalogUnreachableError para ref git inalcançável, sem tocar em disco antes", () => {
  const missing = path.join(tmpdir(), "catalog-origin-nao-existe-xyz.git");
  assert.throws(() => resolveCatalog(missing), CatalogUnreachableError);
});

test("defaultCatalogRef lê _src_path e _commit de .copier-answers.yml", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "copier-answers-"));
  const answersPath = path.join(dir, ".copier-answers.yml");
  writeFileSync(answersPath, "_src_path: gh:EmanuelVogt/platform-template\n_commit: v1.0.0\n", "utf8");
  assert.equal(defaultCatalogRef(answersPath), "gh:EmanuelVogt/platform-template#v1.0.0");
});

test("defaultCatalogRef retorna undefined quando o arquivo não existe", () => {
  assert.equal(defaultCatalogRef(path.join(tmpdir(), "nao-existe-copier-answers.yml")), undefined);
});

test("resolveCatalog clona via git sparse-checkout um repositório bare local e resolve a raiz catalog/", () => {
  const bareDir = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));

  const result = resolveCatalog(bareDir, { cacheRoot });

  assert.equal(result.kind, "git");
  assert.ok(existsSync(path.join(result.root, "alpha", "module.json")));
});

test("resolveCatalog resolve um caminho local com sufixo #<ref> para o diretório antes do #", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "catalog-local-ref-"));
  const withRef = `${dir}#v0.2.0-87-g48e6855`;

  const result = resolveCatalog(withRef);

  assert.deepEqual(result, { kind: "local", root: dir, ref: withRef });
});

test("splitCatalogRef separa um caminho local puro (sem #)", () => {
  const dir = "/tmp/algum-diretorio";
  assert.deepEqual(splitCatalogRef(dir), { source: dir, gitRef: undefined });
  assert.equal(isGitRef(dir), false);
});

test("splitCatalogRef separa um caminho local#<ref> em (source, gitRef)", () => {
  const dir = "/tmp/algum-diretorio";
  assert.deepEqual(splitCatalogRef(`${dir}#v1.2.3`), { source: dir, gitRef: "v1.2.3" });
  assert.equal(isGitRef(dir), false);
});

test("splitCatalogRef separa uma fonte gh:owner/repo (sem #) e isGitRef reconhece como git", () => {
  const source = "gh:owner/repo";
  assert.deepEqual(splitCatalogRef(source), { source, gitRef: undefined });
  assert.equal(isGitRef(source), true);
});

test("splitCatalogRef separa gh:owner/repo#<ref> em (source, gitRef) e isGitRef reconhece como git", () => {
  const result = splitCatalogRef("gh:owner/repo#v2.0.0");
  assert.deepEqual(result, { source: "gh:owner/repo", gitRef: "v2.0.0" });
  assert.equal(isGitRef(result.source), true);
});

test("splitCatalogRef corta na PRIMEIRA # quando a própria fonte contém #", () => {
  assert.deepEqual(splitCatalogRef("/tmp/weird#dir#v1"), { source: "/tmp/weird", gitRef: "dir#v1" });
});
