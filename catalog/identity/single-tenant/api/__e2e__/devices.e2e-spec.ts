import { type INestApplication, VersioningType } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"

import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"
import { AppModule } from "../../../app.module"
import { applySecurity } from "../../../main"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../shared/kernel/context/request-context.middleware"
import { seedUser } from "../testing/seed-user"

import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const EMAIL = "devices-e2e@example.com"
const PASSWORD = "Senha-Muito-Forte-2026!"
const SESSION_COOKIE = "rit_session"
const DEVICE_COOKIE = "rit_device"

type Jar = Record<string, string>
type DeviceItem = { id: string; current: boolean; activeSessionCount: number }

function parseSetCookie(raw: string[] | string | undefined): Jar {
  const arr = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
  const jar: Jar = {}
  for (const entry of arr) {
    const pair = entry.split(";", 1)[0] ?? ""
    const eq = pair.indexOf("=")
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return jar
}

function cookieHeader(jar: Jar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")
}

describe("/auth/devices (e2e)", () => {
  let app: INestApplication
  let pool: Pool

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
    applySecurity(app)
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
    pool = createTestPool()
  })

  afterAll(async () => {
    await pool.end()
    await app.close()
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await seedUser(app, pool, {
      email: EMAIL,
      name: "Devices E2E",
      password: PASSWORD,
    })
  })

  async function login(deviceCookie?: string): Promise<Jar> {
    const req = request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
    if (deviceCookie) req.set("Cookie", `${DEVICE_COOKIE}=${deviceCookie}`)
    const res = await req
      .send({ email: EMAIL, password: PASSWORD, rememberMe: false })
      .expect(200)
    return parseSetCookie(res.headers["set-cookie"])
  }

  function listDevices(jar: Jar) {
    return request(app.getHttpServer())
      .get("/v1/auth/devices")
      .set("Origin", ORIGIN)
      .set("Cookie", cookieHeader(jar))
  }

  it("login sem cookie de device → Set-Cookie de device novo", async () => {
    const jar = await login()
    expect(jar[DEVICE_COOKIE]).toBeDefined()
    expect(jar[SESSION_COOKIE]).toBeDefined()
  })

  it("relogin com o MESMO cookie de device → 1 device, 1 sessão; a anterior morre", async () => {
    const jar1 = await login()
    const deviceCookie = jar1[DEVICE_COOKIE]
    expect(deviceCookie).toBeDefined()
    const jar2 = await login(deviceCookie)
    // sliding: o mesmo valor de cookie de device volta no 2º login
    expect(jar2[DEVICE_COOKIE]).toBe(deviceCookie)

    // o relogin revoga a sessão anterior do device → token antigo não autentica
    await listDevices(jar1).expect(401)

    const res = await listDevices(jar2).expect(200)
    const devices = res.body.devices as DeviceItem[]
    expect(devices).toHaveLength(1)
    expect(devices[0]?.activeSessionCount).toBe(1)
    expect(devices[0]?.current).toBe(true)
  })

  it("DELETE /auth/devices/:id derruba as sessões do outro device", async () => {
    const jarA = await login()
    const jarB = await login() // sem cookie de device → device novo

    const listA = await listDevices(jarA).expect(200)
    const other = (listA.body.devices as DeviceItem[]).find((d) => !d.current)
    if (!other) throw new Error("device do segundo login não encontrado")

    await request(app.getHttpServer())
      .delete(`/v1/auth/devices/${other.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookieHeader(jarA))
      .expect(204)

    const after = await listDevices(jarA).expect(200)
    expect(after.body.devices as DeviceItem[]).toHaveLength(1)
    expect((after.body.devices as DeviceItem[])[0]?.current).toBe(true)

    // a sessão de B morreu por cascade do device → 401
    await listDevices(jarB).expect(401)
  })

  it("revogar o device atual → 409", async () => {
    const jar = await login()
    const list = await listDevices(jar).expect(200)
    const current = (list.body.devices as DeviceItem[]).find((d) => d.current)
    if (!current) throw new Error("device atual não encontrado")

    await request(app.getHttpServer())
      .delete(`/v1/auth/devices/${current.id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookieHeader(jar))
      .expect(409)
  })

  it("DELETE /auth/devices (outros) mantém o atual e derruba os demais", async () => {
    const jarA = await login()
    await login() // device B

    await request(app.getHttpServer())
      .delete("/v1/auth/devices")
      .set("Origin", ORIGIN)
      .set("Cookie", cookieHeader(jarA))
      .expect(204)

    const after = await listDevices(jarA).expect(200)
    expect(after.body.devices as DeviceItem[]).toHaveLength(1)
    expect((after.body.devices as DeviceItem[])[0]?.current).toBe(true)
  })
})
