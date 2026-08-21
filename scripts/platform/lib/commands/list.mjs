import path from "node:path";
import { resolveCatalog } from "../catalog-source.mjs";
import { EXIT_CODES } from "../exit-codes.mjs";
import { readLock } from "../lock.mjs";
import { readManifest } from "../manifest.mjs";

function entryRootFor(catalogRoot, name, variant) {
  return variant ? path.join(catalogRoot, name, variant) : path.join(catalogRoot, name);
}

export async function listCommand({ options, cwd = process.cwd() }) {
  const lockPath = path.join(cwd, ".platform-modules.lock");
  const lock = readLock(lockPath);
  const moduleNames = Object.keys(lock.modules ?? {});

  if (moduleNames.length === 0) {
    process.stdout.write("nenhum módulo instalado\n");
    return EXIT_CODES.OK;
  }

  let catalog;
  try {
    catalog = resolveCatalog(options["catalog-ref"], { copierAnswersPath: path.join(cwd, ".copier-answers.yml") });
  } catch (err) {
    process.stderr.write(`catálogo inacessível: ${err.message}\n`);
    return EXIT_CODES.CATALOG_UNREACHABLE;
  }

  for (const name of moduleNames) {
    const entry = lock.modules[name];
    const entryRoot = entryRootFor(catalog.root, name, entry.variant);
    let headVersion = "desconhecida";
    try {
      headVersion = readManifest(path.join(entryRoot, "module.json")).version;
    } catch {
      headVersion = "desconhecida";
    }
    const label = entry.variant ? `${name}/${entry.variant}` : name;
    process.stdout.write(`${label}: lock=${entry.version} catalog=${headVersion}\n`);
  }

  return EXIT_CODES.OK;
}
