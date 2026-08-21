import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"

import { AppModule } from "../app.module"
import { loadDotenvForDev } from "../shared/config/load-dotenv"

import { buildOpenApiDocument } from "./openapi-config"

async function exportOpenApi(): Promise<void> {
  loadDotenvForDev()
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  })
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })

  const document = buildOpenApiDocument(app)

  // openapi.json na raiz do monorepo (consumido pelo Kubb no api-client).
  const outPath = join(process.cwd(), "..", "..", "openapi.json")
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`)
  await app.close()
}

void exportOpenApi().catch((err: unknown) => {
  console.error(
    `[contract] export falhou: ${err instanceof Error ? err.message : String(err)}`
  )
  process.exitCode = 1
})
