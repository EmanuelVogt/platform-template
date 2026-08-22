import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { MAILER } from "../../notification/domain/ports/mailer"
import { RATE_LIMITER } from "../domain/ports/rate-limiter"
import { fakeMailer } from "../testing/fake-mailer"
import { seedUser } from "../testing/seed-user"

const ORIGIN = "http://localhost:5173"

const allowAll = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}

describe("Lixeira de usuários (e2e)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "truncate table notification.notifications, notification.notification_deliveries",
    )
    await pool.end()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMITER)
      .useValue(allowAll)
      .overrideProvider(MAILER)
      .useValue(fakeMailer())
      .compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("delete → lixeira → restore → purge → e-mail liberado", async () => {
    const pool = createTestPool()
    const masterId = await seedUser(app, pool, {
      email: "master@example.com",
      name: "Master",
      password: "Senha-Master-Muito-Forte-2026!",
    })
    await pool.query("UPDATE identity.users SET access_profile = 'master' WHERE id = $1", [masterId])
    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: "master@example.com", password: "Senha-Master-Muito-Forte-2026!" })
      .expect(200)
    const cookie = loginRes.headers["set-cookie"]

    // cria e localiza a Bia
    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .set("Idempotency-Key", "trash-create-1")
      .send({ name: "Bia", email: "bia@example.com", accessProfile: "admin", permissions: ["admin.users.read"] })
      .expect(201)
    const listed = await request(app.getHttpServer())
      .get("/v1/admin/users").query({ q: "bia" })
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .expect(200)
    const biaId = listed.body.data[0].id as string

    // soft delete → some do default, aparece na lixeira com deletedAt
    await request(app.getHttpServer())
      .delete(`/v1/admin/users/${biaId}`)
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .expect(204)
    const normal = await request(app.getHttpServer())
      .get("/v1/admin/users").query({ q: "bia" })
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .expect(200)
    expect(normal.body.data).toHaveLength(0)
    const trash = await request(app.getHttpServer())
      .get("/v1/admin/users").query({ q: "bia", deleted: "true" })
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .expect(200)
    expect(trash.body.data).toHaveLength(1)
    expect(trash.body.data[0].deletedAt).not.toBeNull()

    // e-mail preso: 409 com o type novo
    const conflict = await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .set("Idempotency-Key", "trash-create-2")
      .send({ name: "Bia 2", email: "bia@example.com", accessProfile: "admin", permissions: ["admin.users.read"] })
      .expect(409)
    expect(conflict.body.type).toMatch(/email-belongs-to-deleted-user$/)

    // restore → volta ao default
    const restored = await request(app.getHttpServer())
      .post("/v1/admin/users/restore")
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .send({ userIds: [biaId] })
      .expect(200)
    expect(restored.body).toEqual({ restored: 1 })
    const back = await request(app.getHttpServer())
      .get("/v1/admin/users").query({ q: "bia" })
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .expect(200)
    expect(back.body.data).toHaveLength(1)

    // purge de quem NÃO está na lixeira → 409
    const notInTrash = await request(app.getHttpServer())
      .post("/v1/admin/users/purge")
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .send({ userIds: [biaId] })
      .expect(409)
    expect(notInTrash.body.type).toMatch(/user-not-in-trash$/)

    // delete + purge → e-mail liberado
    await request(app.getHttpServer())
      .delete(`/v1/admin/users/${biaId}`)
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .expect(204)
    const purged = await request(app.getHttpServer())
      .post("/v1/admin/users/purge")
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .send({ userIds: [biaId] })
      .expect(200)
    expect(purged.body).toEqual({ purged: 1 })
    await request(app.getHttpServer())
      .post("/v1/admin/users")
      .set("Origin", ORIGIN).set("Cookie", cookie!)
      .set("Idempotency-Key", "trash-create-3")
      .send({ name: "Bia Nova", email: "bia@example.com", accessProfile: "admin", permissions: ["admin.users.read"] })
      .expect(201)

    await pool.end()
  })
})
