import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { AppModule } from "../../src/app.module"
import { setupDocsAuth } from "../../src/docs/docs-auth"
import { applySecurity } from "../../src/main"
import { RATE_LIMITER } from "../../src/modules/identity/domain/ports/rate-limiter"
import { MAILER, type Mailer } from "../../src/modules/notification/domain/ports/mailer"
import { RequestContext } from "../../src/shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../src/shared/kernel/context/request-context.middleware"
import { allowAllRateLimiter } from "../setup/app-factory"
import { seedUser } from "../setup/seed-user"
import { createTestPool, truncateIdentity, truncateKernel } from "../setup/test-db"

import type { OpenAPIObject } from "@nestjs/swagger"
import type { Pool } from "pg"

const PASSWORD = "Senha-Docs-Muito-Forte-2026!"
const EMAIL = "docs-login@example.com"
const HOST = "docs.example.test"

const EMPTY_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "docs-e2e", version: "1.0.0" },
  paths: {},
} as OpenAPIObject

function makeFakeMailer(): jest.Mocked<Mailer> {
  return {
    sendAccessLink: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendLockoutNotice: jest.fn().mockResolvedValue(undefined),
    sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
    sendDeviceNewLogin: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeConfirmation: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeNotice: jest.fn().mockResolvedValue(undefined),
  }
}

describe("docs login — checagem de origem (e2e)", () => {
  let app: INestApplication
  let pool: Pool

  beforeAll(async () => {
    pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAllRateLimiter)
      .overrideProvider(MAILER)
      .useValue(makeFakeMailer())
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    // Igual ao main: docs registradas ANTES do init — depois, as rotas express
    // cairiam atrás do catch-all 404 do Nest e nunca seriam alcançadas.
    setupDocsAuth(app, EMPTY_DOCUMENT)
    await app.init()

    await seedUser(app, pool, { email: EMAIL, password: PASSWORD })
  })

  afterAll(async () => {
    await pool.end()
    await app.close()
  })

  it("Origin de outro host → 403 sem Set-Cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/docs/login")
      .set("Origin", "https://atacante.example.com")
      .type("form")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(403)
    expect(res.headers["set-cookie"]).toBeUndefined()
  })

  it("sem Origin e sem Referer → 403", async () => {
    await request(app.getHttpServer())
      .post("/docs/login")
      .type("form")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(403)
  })

  it("Origin igual ao host → login e redirect para /docs", async () => {
    const res = await request(app.getHttpServer())
      .post("/docs/login")
      .set("Host", HOST)
      .set("Origin", `http://${HOST}`)
      .type("form")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(302)
    expect(res.headers.location).toBe("/docs")
    expect(res.headers["set-cookie"]).toBeDefined()
  })

  it("Referer do próprio host serve de fallback", async () => {
    const res = await request(app.getHttpServer())
      .post("/docs/login")
      .set("Host", HOST)
      .set("Referer", `http://${HOST}/docs/login?redirect=%2Fdocs`)
      .type("form")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(302)
    expect(res.headers["set-cookie"]).toBeDefined()
  })

  it("senha errada continua 401 na origem certa", async () => {
    await request(app.getHttpServer())
      .post("/docs/login")
      .set("Host", HOST)
      .set("Origin", `http://${HOST}`)
      .type("form")
      .send({ email: EMAIL, password: "senha-errada" })
      .expect(401)
  })
})
