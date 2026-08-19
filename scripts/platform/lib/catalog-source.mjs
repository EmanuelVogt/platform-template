import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export class CatalogUnreachableError extends Error {
  constructor(ref, reason) {
    super(`catálogo inacessível: ${ref} — ${reason}`);
    this.name = "CatalogUnreachableError";
    this.ref = ref;
  }
}

function isGitRef(ref) {
  return /^(git@|https?:\/\/|gh:|file:\/\/)/.test(ref) || ref.endsWith(".git");
}

function hashRef(ref) {
  return createHash("sha1").update(ref).digest("hex").slice(0, 12);
}

export function defaultCatalogRef(copierAnswersPath) {
  if (!existsSync(copierAnswersPath)) return undefined;
  const answers = parseYaml(readFileSync(copierAnswersPath, "utf8")) ?? {};
  if (!answers._src_path) return undefined;
  return answers._commit ? `${answers._src_path}#${answers._commit}` : answers._src_path;
}

export function resolveCatalog(
  ref,
  { cacheRoot = path.join(tmpdir(), "platform-catalog"), copierAnswersPath = ".copier-answers.yml" } = {},
) {
  const resolvedRef = ref ?? defaultCatalogRef(copierAnswersPath);
  if (!resolvedRef) {
    throw new CatalogUnreachableError(
      String(ref),
      "nenhuma referência informada e .copier-answers.yml sem _src_path",
    );
  }

  if (!isGitRef(resolvedRef)) {
    if (!existsSync(resolvedRef) || !statSync(resolvedRef).isDirectory()) {
      throw new CatalogUnreachableError(resolvedRef, "diretório local não encontrado");
    }
    return { kind: "local", root: resolvedRef, ref: resolvedRef };
  }

  const [url, gitRefName] = resolvedRef.split("#");
  const dest = path.join(cacheRoot, hashRef(resolvedRef));

  try {
    execFileSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        ...(gitRefName ? ["--branch", gitRefName] : []),
        url,
        dest,
      ],
      { stdio: "pipe" },
    );
    execFileSync("git", ["sparse-checkout", "set", "catalog"], { cwd: dest, stdio: "pipe" });
  } catch (err) {
    throw new CatalogUnreachableError(resolvedRef, err.message);
  }

  return { kind: "git", root: path.join(dest, "catalog"), ref: resolvedRef };
}
