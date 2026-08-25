import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { expectProblem } from "../../../shared/test/e2e/problem"
import { resetDb } from "../../../shared/test/int/db"
import { MAILER } from "../../notification/domain/ports/mailer"
import { fakeMailer, loginAs, seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const MASTER = "master@example.com"
// Master próprio do segundo caso: re-semear o mesmo e-mail como master é no-op
// no insert e o rebaixamento do master anterior valeria contra ele mesmo.
const MASTER_2 = "master2@example.com"

describe("Lixeira de usuários (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    await resetDb(db.pool, ["identity", "_kernel", "notification"])
    e2e = await createE2eApp({ overrides: [[MAILER, fakeMailer()]] })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("delete → lixeira → restore → purge → e-mail liberado", async () => {
    await seedUser(e2e.app, db.pool, {
      email: MASTER,
      name: "Master",
      password: TEST_PASSWORD,
      accessProfile: "master",
    })
    const cookies = await loginAs(e2e.http, MASTER)

    // cria e localiza a Bia
    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .set("Idempotency-Key", "trash-create-1")
      .send({
        name: "Bia",
        email: "bia@example.com",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)
    const listed = await e2e.http
      .get("/v1/admin/users")
      .query({ q: "bia" })
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)
    const biaId = listed.body.data[0].id as string

    // soft delete → some do default, aparece na lixeira com deletedAt
    await e2e.http
      .delete(`/v1/admin/users/${biaId}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(204)
    const normal = await e2e.http
      .get("/v1/admin/users")
      .query({ q: "bia" })
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)
    expect(normal.body.data).toHaveLength(0)
    const trash = await e2e.http
      .get("/v1/admin/users")
      .query({ q: "bia", deleted: "true" })
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)
    expect(trash.body.data).toHaveLength(1)
    expect(trash.body.data[0].deletedAt).not.toBeNull()

    // e-mail preso: 409 igual ao de e-mail já em uso — a lixeira não é contada
    // ao chamador
    const conflict = await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .set("Idempotency-Key", "trash-create-2")
      .send({
        name: "Bia 2",
        email: "bia@example.com",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(409)
    expectProblem(conflict, { status: 409, type: "email-already-in-use" })

    // restore → volta ao default
    const restored = await e2e.http
      .post("/v1/admin/users/restore")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .send({ userIds: [biaId] })
      .expect(200)
    expect(restored.body).toEqual({ restored: 1 })
    const back = await e2e.http
      .get("/v1/admin/users")
      .query({ q: "bia" })
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)
    expect(back.body.data).toHaveLength(1)

    // purge de quem NÃO está na lixeira → 409
    const notInTrash = await e2e.http
      .post("/v1/admin/users/purge")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .send({ userIds: [biaId] })
      .expect(409)
    expectProblem(notInTrash, { status: 409, type: "user-not-in-trash" })

    // delete + purge → e-mail liberado
    await e2e.http
      .delete(`/v1/admin/users/${biaId}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(204)
    const purged = await e2e.http
      .post("/v1/admin/users/purge")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .send({ userIds: [biaId] })
      .expect(200)
    expect(purged.body).toEqual({ purged: 1 })
    await e2e.http
      .post("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .set("Idempotency-Key", "trash-create-3")
      .send({
        name: "Bia Nova",
        email: "bia@example.com",
        accessProfile: "admin",
        permissions: ["admin.users.read"],
      })
      .expect(201)
  })

  it("sessão viva de usuário excluído deixa de valer na hora", async () => {
    await seedUser(e2e.app, db.pool, {
      email: MASTER_2,
      name: "Master",
      password: TEST_PASSWORD,
      accessProfile: "master",
    })
    const victimId = await seedUser(e2e.app, db.pool, {
      email: "excluido@example.com",
      name: "Excluído",
      password: TEST_PASSWORD,
      permissions: ["admin.users.read"],
    })

    const masterCookies = await loginAs(e2e.http, MASTER_2)
    const victimCookies = await loginAs(e2e.http, "excluido@example.com")

    // antes da exclusão a sessão vale, inclusive em rota self-service
    await e2e.http
      .get("/v1/auth/devices")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", victimCookies)
      .expect(200)

    await e2e.http
      .delete(`/v1/admin/users/${victimId}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", masterCookies)
      .expect(204)

    // SPEC_DEVIATION: the AC says requireAuth answers 403; with nothing
    // published the kernel AccessGuard refuses first, with 401.
    // Reason: REM-43 asks the middleware to publish NOTHING for a deleted user,
    // so no actor reaches the application layer; requireAuth's own 403 is
    // proven in application/require-auth.spec.ts.
    await e2e.http
      .get("/v1/auth/devices")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", victimCookies)
      .expect(401)
    await e2e.http
      .get("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", victimCookies)
      .expect(401)
  })

  it("?deleted=true sem admin.users.trash.read → 403, listagem normal segue 200", async () => {
    const email = "leitor-trash@example.com"
    await seedUser(e2e.app, db.pool, {
      email,
      name: "Leitor",
      password: TEST_PASSWORD,
      permissions: ["admin.users.read"],
    })
    const cookies = await loginAs(e2e.http, email)

    await e2e.http
      .get("/v1/admin/users")
      .query({ deleted: "true" })
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(403)
    await e2e.http
      .get("/v1/admin/users")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
      .expect(200)
  })
})
