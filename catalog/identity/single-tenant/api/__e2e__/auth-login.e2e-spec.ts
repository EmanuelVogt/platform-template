import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { InMemoryRateLimiter } from "../../../shared/kernel/rate-limit/in-memory-rate-limiter"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { allowAllRateLimiter } from "../testing/allow-all-rate-limiter"
import { seedUser } from "../testing/seed-user"

const ORIGIN = "http://localhost:5173"
const EMAIL = "login-cookie@example.com"
const PASSWORD = "Senha-Muito-Forte-2026!"
const BRUTE_EMAIL = "login-brute@example.com"

describe("Login — cookie de sessão (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.end()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAllRateLimiter)
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()

    const seedPool = createTestPool()
    await seedUser(app, seedPool, {
      email: EMAIL,
      name: "Login Cookie",
      password: PASSWORD,
    })
    await seedPool.end()
  })

  afterAll(async () => {
    await app.close()
  })

  it("login retorna 200 com user e Set-Cookie __Host- httpOnly SameSite", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: EMAIL, password: PASSWORD, rememberMe: true })
      .expect(200)

    expect(res.body.user.email).toBe(EMAIL)
    expect(res.body.user.id).toBeDefined()

    const setCookie = res.headers["set-cookie"]
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie
    // e2e-env usa COOKIE_NAME=rit_session (sem prefixo __Host-, que exige Secure).
    expect(cookie).toContain("rit_session=")
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Path=\//i)
    expect(cookie).not.toMatch(/Domain=/i)
    // Secure depende de COOKIE_SECURE (false no e2e-env); não asserido aqui.
  })
})

describe("Login — força bruta distribuída por conta (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.end()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Limiter real (em memória): o bucket por conta precisa contar de verdade.
      .overrideProvider(RATE_LIMITER)
      .useValue(new InMemoryRateLimiter())
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    // TRUST_PROXY_HOPS é 0 por padrão; sem confiar em um hop o teste não
    // conseguiria variar o IP de origem, que é o ponto do caso.
    app.getHttpAdapter().getInstance().set("trust proxy", 1)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()

    const seedPool = createTestPool()
    await seedUser(app, seedPool, {
      email: BRUTE_EMAIL,
      name: "Login Brute",
      password: PASSWORD,
    })
    await seedPool.end()
  })

  afterAll(async () => {
    await app.close()
  })

  it("11ª falha na mesma conta, vinda de dois IPs, responde 429 com Retry-After", async () => {
    const attempt = (ip: string) =>
      request(app.getHttpServer())
        .post("/v1/auth/login")
        .set("Origin", ORIGIN)
        .set("X-Forwarded-For", ip)
        .send({ email: BRUTE_EMAIL, password: "senha-errada", rememberMe: false })

    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      // Alterna os IPs: o teto de 10 é da conta, não de um IP (o bucket por
      // IP é 30/min e nem chega perto de estourar aqui).
      const res = await attempt(i % 2 === 0 ? "203.0.113.7" : "198.51.100.9")
      statuses.push(res.status)
      if (i === 10) {
        expect(res.status).toBe(429)
        expect(res.headers["retry-after"]).toBeDefined()
        expect(res.headers["content-type"]).toMatch(/application\/problem\+json/)
        expect(res.body.status).toBe(429)
      }
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401))
  })

  it("senha correta depois de falhas limpa o bucket da conta", async () => {
    const email = "login-brute-reset@example.com"
    const seedPool = createTestPool()
    await seedUser(app, seedPool, {
      email,
      name: "Login Brute Reset",
      password: PASSWORD,
    })
    await seedPool.end()

    const login = (password: string) =>
      request(app.getHttpServer())
        .post("/v1/auth/login")
        .set("Origin", ORIGIN)
        .set("X-Forwarded-For", "203.0.113.8")
        .send({ email, password, rememberMe: false })

    for (let i = 0; i < 9; i++) {
      await login("senha-errada")
    }
    await login(PASSWORD).expect(200)

    // Bucket zerado: outras 9 falhas ainda não estouram o teto de 10.
    for (let i = 0; i < 9; i++) {
      await login("senha-errada").expect(401)
    }
  })
})
