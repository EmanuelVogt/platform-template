import request from "supertest"

import { createE2eApp } from "../../../../test/setup/app-factory"
import { setCookies } from "../../../../test/setup/cookies"
import {
  createTestPool,
  seedEmail,
  truncateIdentity,
  truncateKernel,
  truncateTag,
} from "../../../../test/setup/test-db"
import { RATE_LIMITER } from "../../identity/domain/ports/rate-limiter"
import { allowAllRateLimiter } from "../../identity/testing/allow-all-rate-limiter"
import { seedUser } from "../../identity/testing/seed-user"

import type { INestApplication } from "@nestjs/common"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Tags-Muito-Forte-2026!"

const readerEmail = seedEmail("tag-tags", "reader")
const managerEmail = seedEmail("tag-tags", "manager")
const noPermEmail = seedEmail("tag-tags", "no-perm")

const ALL_TAG_PERMISSIONS = [
  "admin.tags.read",
  "admin.tags.create",
  "admin.tags.update",
  "admin.tags.delete",
  "admin.tags.trash.read",
  "admin.tags.trash.restore",
  "admin.tags.trash.purge",
]

describe("Tags (e2e)", () => {
  let app: INestApplication
  let readerCookie: string[]
  let managerCookie: string[]
  let noPermCookie: string[]

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await truncateTag(pool)

    app = await createE2eApp((b) =>
      b.overrideProvider(RATE_LIMITER).useValue(allowAllRateLimiter)
    )

    await seedUser(app, pool, {
      email: readerEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.tags.read"],
    })
    await seedUser(app, pool, {
      email: managerEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ALL_TAG_PERMISSIONS,
    })
    await seedUser(app, pool, {
      email: noPermEmail,
      password: PASSWORD,
      accessProfile: "admin",
      permissions: [],
    })
    await pool.end()

    readerCookie = await login(app, readerEmail)
    managerCookie = await login(app, managerEmail)
    noPermCookie = await login(app, noPermEmail)
  })

  afterAll(async () => {
    await app.close()
  })

  describe("POST /v1/admin/tags", () => {
    it("cria a tag → 201", async () => {
      const res = await request(app.getHttpServer())
        .post("/v1/admin/tags")
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .set("Idempotency-Key", "tag-create-201")
        .send({ name: "Relaxante", color: "#aa5641" })
        .expect(201)

      expect(res.body.id).toHaveLength(26)
      expect(res.body.name).toBe("Relaxante")
      expect(res.body.color).toBe("#aa5641")
      expect(res.body.isActive).toBe(true)
      expect(res.body.deletedAt).toBeNull()
    })

    it("conflito de nome entre vivas → 409 tag-conflict", async () => {
      await createTag(app, managerCookie, "Facial")
      const res = await request(app.getHttpServer())
        .post("/v1/admin/tags")
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .send({ name: "facial" })
        .expect(409)
      expect(res.body.type).toContain("/tag-conflict")
    })

    it("nega criação sem permissão → 403", async () => {
      await request(app.getHttpServer())
        .post("/v1/admin/tags")
        .set("Origin", ORIGIN)
        .set("Cookie", readerCookie)
        .send({ name: "Negada" })
        .expect(403)
    })
  })

  describe("GET /v1/admin/tags", () => {
    // Sem consumidor registrado no TagUsageRegistry o uso é sempre zero: o
    // produto que registrar um reader é quem passa a alimentar este número.
    it("uso zerado sem reader de uso registrado", async () => {
      const tagId = await createTag(app, managerCookie, "Sem uso")
      const res = await request(app.getHttpServer())
        .get("/v1/admin/tags?q=Sem uso")
        .set("Origin", ORIGIN)
        .set("Cookie", readerCookie)
        .expect(200)
      const listed = res.body.data.find(
        (tag: { id: string }) => tag.id === tagId
      )
      expect(listed.usage).toEqual({ total: 0 })
    })
  })

  describe("GET /v1/admin/tags/linkable", () => {
    it("libera quem lê a central → 200", async () => {
      await request(app.getHttpServer())
        .get("/v1/admin/tags/linkable")
        .set("Origin", ORIGIN)
        .set("Cookie", readerCookie)
        .expect(200)
    })

    it("nega quem não lê a central → 403", async () => {
      await request(app.getHttpServer())
        .get("/v1/admin/tags/linkable")
        .set("Origin", ORIGIN)
        .set("Cookie", noPermCookie)
        .expect(403)
    })

    it("não lista tag inativa nem na lixeira", async () => {
      const inactiveId = await createTag(app, managerCookie, "Inativa", false)
      const trashedId = await createTag(app, managerCookie, "Na lixeira")
      await request(app.getHttpServer())
        .delete(`/v1/admin/tags/${trashedId}`)
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(204)

      const res = await request(app.getHttpServer())
        .get("/v1/admin/tags/linkable")
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(200)
      const ids = (res.body as { id: string }[]).map((tag) => tag.id)
      expect(ids).not.toContain(inactiveId)
      expect(ids).not.toContain(trashedId)
    })
  })

  describe("lixeira", () => {
    it("delete manda para a lixeira e restore devolve", async () => {
      const tagId = await createTag(app, managerCookie, "Vai e volta")
      await request(app.getHttpServer())
        .delete(`/v1/admin/tags/${tagId}`)
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(204)
      await request(app.getHttpServer())
        .get(`/v1/admin/tags/${tagId}`)
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(404)

      const restored = await request(app.getHttpServer())
        .post("/v1/admin/tags/restore")
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .send({ tagIds: [tagId] })
        .expect(200)
      expect(restored.body).toEqual({ restored: 1 })
      await request(app.getHttpServer())
        .get(`/v1/admin/tags/${tagId}`)
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(200)
    })

    it("purga tag da lixeira → 200 e a tag some do catálogo", async () => {
      const tagId = await createTag(app, managerCookie, "Purgável")
      await request(app.getHttpServer())
        .delete(`/v1/admin/tags/${tagId}`)
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(204)

      const purged = await request(app.getHttpServer())
        .delete("/v1/admin/tags/purge")
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .send({ tagIds: [tagId] })
        .expect(200)
      expect(purged.body).toEqual({ purged: 1 })

      await request(app.getHttpServer())
        .get(`/v1/admin/tags/${tagId}`)
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(404)
    })

    it("purge de tag fora da lixeira → 409 tag-not-in-trash", async () => {
      const tagId = await createTag(app, managerCookie, "Viva demais")
      const res = await request(app.getHttpServer())
        .delete("/v1/admin/tags/purge")
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .send({ tagIds: [tagId] })
        .expect(409)
      expect(res.body.type).toContain("/tag-not-in-trash")
    })
  })
})

async function login(app: INestApplication, email: string): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post("/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: PASSWORD })
    .expect(200)
  return setCookies(res)
}

async function createTag(
  app: INestApplication,
  cookie: string[],
  name: string,
  isActive = true
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/v1/admin/tags")
    .set("Origin", ORIGIN)
    .set("Cookie", cookie)
    .send({ name, isActive })
    .expect(201)
  return res.body.id as string
}
