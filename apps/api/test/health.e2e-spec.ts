import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AppModule } from "../src/app.module"
import { parseEnv } from "../src/shared/config/env"
import { DedicatedClientFactory } from "../src/shared/infra/database/dedicated-client.factory"
import { PG_POOL } from "../src/shared/infra/database/drizzle.provider"
import { RequestContext } from "../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../src/shared/kernel/context/request-context.middleware"

import { makeTestLogger } from "./setup/test-logger"

import type { Pool, PoolClient } from "pg"

async function bootAppWithUnreachableReadiness(): Promise<INestApplication> {
  const { loggerFactory } = makeTestLogger()
  const unreachable = new DedicatedClientFactory(
    loggerFactory.forModule("teste"),
    parseEnv({
      ...process.env,
      DATABASE_URL: "postgres://u:p@127.0.0.1:1/indisponivel",
    })
  )

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DedicatedClientFactory)
    .useValue(unreachable)
    .compile()

  const app = moduleRef.createNestApplication()
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
  app.use(createRequestContextMiddleware(app.get(RequestContext)))
  await app.init()
  return app
}

describe("Health + erros (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("GET /health → 200 ok", async () => {
    await request(app.getHttpServer())
      .get("/health")
      .expect(200, { status: "ok" })
  })

  it("GET /ready → 200 ready (contra Postgres real)", async () => {
    await request(app.getHttpServer())
      .get("/ready")
      .expect(200, { status: "ready" })
  })

  it("GET /ready → 200 mesmo com o pool de aplicação saturado", async () => {
    const pool = app.get<Pool>(PG_POOL)
    const max = pool.options.max
    const clients: PoolClient[] = []

    try {
      for (let i = 0; i < max; i += 1) {
        clients.push(await pool.connect())
      }
      expect(pool.idleCount).toBe(0)

      await request(app.getHttpServer())
        .get("/ready")
        .expect(200, { status: "ready" })
    } finally {
      clients.forEach((client) => {
        client.release()
      })
    }
  })

  it("GET /ready → 503 quando o client dedicado do readiness não alcança o banco", async () => {
    const downApp = await bootAppWithUnreachableReadiness()

    try {
      const res = await request(downApp.getHttpServer()).get("/ready")
      expect(res.status).toBe(503)
    } finally {
      await downApp.close()
    }
  })

  it("rota inexistente → 404 RFC 7807 com correlationId do header", async () => {
    // Só um ULID válido é adotado do header (anti-forja); um valor arbitrário
    // seria descartado em favor de um id gerado.
    const correlationId = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
    const res = await request(app.getHttpServer())
      .get("/v1/nope")
      .set("X-Correlation-Id", correlationId)
      .expect(404)

    expect(res.headers["content-type"]).toContain("application/problem+json")
    expect(res.body.type).toContain("/http/404")
    expect(res.body.status).toBe(404)
    expect(res.body.correlationId).toBe(correlationId)
  })
})
