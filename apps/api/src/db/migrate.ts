import { join } from "node:path"

import { migrate } from "drizzle-orm/node-postgres/migrator"

import { loadDotenvForDev } from "../shared/config/load-dotenv"
import {
  createDrizzle,
  createPool,
} from "../shared/infra/database/drizzle.provider"

import * as schema from "./schema"

// Pasta gerada pelo drizzle-kit (drizzle.config.ts `out`). Resolvida pelo cwd =
// apps/api — vale tanto em dev (dir do package) quanto no container (WORKDIR).
const MIGRATIONS_FOLDER = join(process.cwd(), "drizzle", "migrations")

// Migrator programático via drizzle-orm (prod dep) — NÃO usa drizzle-kit, que é
// devDependency e não existe na imagem de runtime. Roda no deploy antes do app.
async function main(): Promise<void> {
  loadDotenvForDev()
  const pool = createPool()
  try {
    // migrate() pega advisory lock no Postgres: seguro com réplicas concorrentes
    // — uma aplica, as outras esperam e encontram o schema já migrado.
    await migrate(createDrizzle(pool, schema), {
      migrationsFolder: MIGRATIONS_FOLDER,
    })
    console.info("[migrate] migrations aplicadas")
  } finally {
    await pool.end()
  }
}

void main().catch((err: unknown) => {
  console.error(
    `[migrate] falhou: ${err instanceof Error ? err.message : String(err)}`,
  )
  process.exitCode = 1
})
