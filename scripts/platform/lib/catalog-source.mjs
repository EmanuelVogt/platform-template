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

export function isGitRef(source) {
  return /^(git@|https?:\/\/|gh:|file:\/\/)/.test(source) || source.endsWith(".git");
}

function hashRef(ref) {
  return createHash("sha1").update(ref).digest("hex").slice(0, 12);
}

// Uma fonte pode vir como "<source>#<ref>" (ex.: _src_path + _commit do copier).
// O split é na PRIMEIRA "#": uma fonte local cujo próprio nome contenha "#" não é suportada
// e será truncada nesse caractere.
export function splitCatalogRef(ref) {
  const hashIndex = ref.indexOf("#");
  if (hashIndex === -1) return { source: ref, gitRef: undefined };
  return { source: ref.slice(0, hashIndex), gitRef: ref.slice(hashIndex + 1) };
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

  const { source, gitRef } = splitCatalogRef(resolvedRef);

  if (!isGitRef(source)) {
    // Fonte local: o sufixo "#<ref>", se houver, é ignorado na resolução do diretório —
    // um checkout local não tem semântica de "ref" nesta ferramenta. O valor completo
    // (com ref) continua preservado em `ref` para fins de registro (ex.: lock file).
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new CatalogUnreachableError(source, "diretório local não encontrado");
    }
    return { kind: "local", root: source, ref: resolvedRef };
  }

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
        ...(gitRef ? ["--branch", gitRef] : []),
        source,
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
