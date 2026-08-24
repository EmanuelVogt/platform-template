import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CatalogUnreachableError, defaultCatalogRef, expandGitShorthand, isGitRef, resolveCatalog, splitCatalogRef } from "../lib/catalog-source.mjs";

function git(args, cwd) {
  execFileSync("git", ["-c", "user.email=test@test.local", "-c", "user.name=test", ...args], { cwd, stdio: "pipe" });
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
  git(["branch", "-M", "main"], workDir);
  git(["add", "."], workDir);
  git(["commit", "-q", "-m", "init"], workDir);
  git(["tag", "v1.0.0"], workDir);

  const bareDir = `${workDir}.git`;
  git(["clone", "-q", "--bare", workDir, bareDir]);
  return { bareDir, workDir };
}

function pushNewOriginFile(workDir, bareDir, relPath, content) {
  writeFileSync(path.join(workDir, relPath), content, "utf8");
  git(["add", "."], workDir);
  git(["commit", "-q", "-m", "update"], workDir);
  git(["push", "-q", bareDir, "main:main"], workDir);
}

function cacheDirOf(result) {
  return path.dirname(result.root);
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

test("defaultCatalogRef desce em catalog/ quando _src_path é um caminho local (não git)", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "template-repo-"));
  const dir = mkdtempSync(path.join(tmpdir(), "copier-answers-local-"));
  const answersPath = path.join(dir, ".copier-answers.yml");
  writeFileSync(answersPath, `_src_path: ${repoRoot}\n_commit: v0.2.0-87-g48e6855\n`, "utf8");

  assert.equal(defaultCatalogRef(answersPath), `${path.join(repoRoot, "catalog")}#v0.2.0-87-g48e6855`);
});

test("resolveCatalog resolve a fonte default de um _src_path local (raiz do template) até catalog/", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "template-repo-"));
  const catalogDir = path.join(repoRoot, "catalog");
  mkdirSync(catalogDir, { recursive: true });
  const answersDir = mkdtempSync(path.join(tmpdir(), "child-"));
  writeFileSync(
    path.join(answersDir, ".copier-answers.yml"),
    `_src_path: ${repoRoot}\n_commit: v0.2.0-87-g48e6855\n`,
    "utf8",
  );

  const result = resolveCatalog(undefined, { copierAnswersPath: path.join(answersDir, ".copier-answers.yml") });

  assert.deepEqual(result, {
    kind: "local",
    root: catalogDir,
    ref: `${catalogDir}#v0.2.0-87-g48e6855`,
  });
});

test("resolveCatalog clona via git sparse-checkout um repositório bare local e resolve a raiz catalog/", () => {
  const { bareDir } = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));

  const result = resolveCatalog(bareDir, { cacheRoot });

  assert.equal(result.kind, "git");
  assert.ok(existsSync(path.join(result.root, "alpha", "module.json")));
});

test("resolveCatalog duas vezes com o mesmo ref funciona sem limpeza manual do cache (issue #10)", () => {
  const { bareDir } = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));
  const ref = `${bareDir}#v1.0.0`;

  const first = resolveCatalog(ref, { cacheRoot });
  const second = resolveCatalog(ref, { cacheRoot });

  assert.equal(second.kind, "git");
  assert.equal(second.root, first.root);
  assert.ok(existsSync(path.join(second.root, "alpha", "module.json")));
});

test("resolveCatalog reaproveita o cache de um ref imutável (tag) sem clonar de novo", () => {
  const { bareDir } = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));
  const ref = `${bareDir}#v1.0.0`;

  const first = resolveCatalog(ref, { cacheRoot });
  const sentinel = path.join(cacheDirOf(first), "sentinel-reuso.txt");
  writeFileSync(sentinel, "sobrevive se o cache foi reusado", "utf8");

  const second = resolveCatalog(ref, { cacheRoot });

  assert.ok(existsSync(sentinel), "cache de tag deveria ser reusado, não reclonado");
  assert.ok(existsSync(path.join(second.root, "alpha", "module.json")));
});

test("resolveCatalog revalida um ref móvel (branch): a segunda chamada enxerga o que andou no origin", () => {
  const { bareDir, workDir } = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));
  const ref = `${bareDir}#main`;

  const first = resolveCatalog(ref, { cacheRoot });
  assert.ok(!existsSync(path.join(first.root, "alpha", "novo.txt")));
  pushNewOriginFile(workDir, bareDir, path.join("catalog", "alpha", "novo.txt"), "novo conteúdo");

  const second = resolveCatalog(ref, { cacheRoot });

  assert.ok(existsSync(path.join(second.root, "alpha", "novo.txt")));
});

test("resolveCatalog se recupera sozinho de um cache corrompido, sem exigir rm -rf", () => {
  const { bareDir } = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));
  const ref = `${bareDir}#v1.0.0`;

  const first = resolveCatalog(ref, { cacheRoot });
  rmSync(path.join(cacheDirOf(first), ".git"), { recursive: true, force: true });

  const second = resolveCatalog(ref, { cacheRoot });

  assert.ok(existsSync(path.join(second.root, "alpha", "module.json")));
});

test("resolveCatalog se recupera de um clone pela metade (diretório sem catalog/)", () => {
  const { bareDir } = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));
  const ref = `${bareDir}#v1.0.0`;

  const first = resolveCatalog(ref, { cacheRoot });
  rmSync(first.root, { recursive: true, force: true });

  const second = resolveCatalog(ref, { cacheRoot });

  assert.ok(existsSync(path.join(second.root, "alpha", "module.json")));
});

test("resolveCatalog continua reportando inacessível quando o origin some, mesmo com cache móvel presente", () => {
  const { bareDir } = makeBareOriginWithCatalog();
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "catalog-cache-"));
  const ref = `${bareDir}#main`;

  resolveCatalog(ref, { cacheRoot });
  rmSync(bareDir, { recursive: true, force: true });

  assert.throws(() => resolveCatalog(ref, { cacheRoot }), CatalogUnreachableError);
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

test("expandGitShorthand expande gh:/gl: para a URL https clonável", () => {
  assert.equal(expandGitShorthand("gh:owner/repo"), "https://github.com/owner/repo.git");
  assert.equal(expandGitShorthand("gh:owner/repo.git"), "https://github.com/owner/repo.git");
  assert.equal(expandGitShorthand("gl:owner/repo"), "https://gitlab.com/owner/repo.git");
});

test("expandGitShorthand não altera URLs completas nem caminhos locais", () => {
  assert.equal(expandGitShorthand("https://github.com/o/r.git"), "https://github.com/o/r.git");
  assert.equal(expandGitShorthand("git@github.com:o/r.git"), "git@github.com:o/r.git");
  assert.equal(expandGitShorthand("file:///tmp/repo.git"), "file:///tmp/repo.git");
  assert.equal(expandGitShorthand("/tmp/algum-diretorio"), "/tmp/algum-diretorio");
});
