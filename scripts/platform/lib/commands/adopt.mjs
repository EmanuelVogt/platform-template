import path from "node:path"
import { writeLock as persistEntry } from "../apply.mjs"
import { entryRootFor } from "../catalog-graph.mjs"
import { resolveCatalog } from "../catalog-source.mjs"
import { childLayout, webRootFor } from "../child-layout.mjs"
import { EXIT_CODES } from "../exit-codes.mjs"
import { readLock } from "../lock.mjs"
import { readManifest } from "../manifest.mjs"
import { planCopy } from "../plan.mjs"

export async function adoptCommand({ name, options, cwd = process.cwd() }) {
  const { lockPath, copierAnswersPath } = childLayout(cwd)

  let catalog
  let manifest
  try {
    catalog = resolveCatalog(options["catalog-ref"], { copierAnswersPath })
    manifest = readManifest(
      path.join(
        entryRootFor(catalog.root, name, options.variant),
        "module.json"
      )
    )
  } catch (err) {
    process.stderr.write(
      `catálogo inacessível ou módulo ausente: ${err.message}\n`
    )
    return EXIT_CODES.CATALOG_UNREACHABLE
  }

  const entryRoot = entryRootFor(catalog.root, name, options.variant)
  const webRoot = options["web-root"]
    ? webRootFor(name, options["web-root"])
    : undefined
  const { files } = planCopy(entryRoot, manifest, { webRoot, targetRoot: cwd })

  const version = options.version ?? manifest.version
  const lock = readLock(lockPath)
  persistEntry({
    lockPath,
    lock,
    name,
    entry: {
      version,
      variant: manifest.variant,
      installedAt: new Date().toISOString(),
      catalogRef: catalog.ref,
      files: files.map((file) => file.to),
      migrations: [],
    },
  })

  process.stdout.write(
    `${name}@${version} adotado (lock atualizado, sem cópia)\n`
  )
  return EXIT_CODES.OK
}
