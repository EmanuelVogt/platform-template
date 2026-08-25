import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { resetDb } from "../../../shared/test/int/db"
import { loginAs, seedEmail, seedUser } from "../../identity/testing"
import { seedTag } from "../testing"

import type { INestApplication } from "@nestjs/common"
import type { Pool } from "pg"

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
  const db = withE2ePool()
  let app: INestApplication
  let readerCookie: string[]
  let managerCookie: string[]
  let noPermCookie: string[]

  beforeAll(async () => {
    const pool: Pool = db.pool
    await resetDb(pool, ["identity", "_kernel", "tag"])

    app = (await createE2eApp()).app

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

    readerCookie = await loginAs(
      request(app.getHttpServer()),
      readerEmail,
      PASSWORD
    )
    managerCookie = await loginAs(
      request(app.getHttpServer()),
      managerEmail,
      PASSWORD
    )
    noPermCookie = await loginAs(
      request(app.getHttpServer()),
      noPermEmail,
      PASSWORD
    )
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
      await seedTag(app, managerCookie, "Facial")
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
      const tagId = await seedTag(app, managerCookie, "Sem uso")
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

    it("?deleted=true sem admin.tags.trash.read → 403", async () => {
      await request(app.getHttpServer())
        .get("/v1/admin/tags?deleted=true")
        .set("Origin", ORIGIN)
        .set("Cookie", readerCookie)
        .expect(403)
    })

    it("?deleted=true com admin.tags.trash.read → 200", async () => {
      await request(app.getHttpServer())
        .get("/v1/admin/tags?deleted=true")
        .set("Origin", ORIGIN)
        .set("Cookie", managerCookie)
        .expect(200)
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
      const inactiveId = await seedTag(app, managerCookie, "Inativa", false)
      const trashedId = await seedTag(app, managerCookie, "Na lixeira")
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
      const tagId = await seedTag(app, managerCookie, "Vai e volta")
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
      const tagId = await seedTag(app, managerCookie, "Purgável")
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
      const tagId = await seedTag(app, managerCookie, "Viva demais")
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
