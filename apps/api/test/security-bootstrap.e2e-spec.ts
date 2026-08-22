import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AppModule } from "../src/app.module"
import { applySecurity } from "../src/main"

describe("Security bootstrap (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("envia headers do helmet", async () => {
    const res = await request(app.getHttpServer()).get("/health")
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("ecoa Access-Control-Allow-Origin só para a origin permitida", async () => {
    const ok = await request(app.getHttpServer())
      .get("/health")
      .set("Origin", "http://localhost:5173")
    expect(ok.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    )
    expect(ok.headers["access-control-allow-credentials"]).toBe("true")

    const bad = await request(app.getHttpServer())
      .get("/health")
      .set("Origin", "http://evil.example")
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined()
  })
})
