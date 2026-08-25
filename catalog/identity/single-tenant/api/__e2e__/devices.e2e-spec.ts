import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"
import { cookieHeader, cookieValue } from "../../../shared/test/e2e/http"
import { resetDb } from "../../../shared/test/int/db"
import { seedUser, TEST_PASSWORD } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"

const EMAIL = "devices-e2e@example.com"
const SESSION_COOKIE = "rit_session"
const DEVICE_COOKIE = "rit_device"

type DeviceItem = { id: string; current: boolean; activeSessionCount: number }

describe("/auth/devices (e2e)", () => {
  const db = withE2ePool()
  let e2e: E2eApp

  beforeAll(async () => {
    e2e = await createE2eApp({ rateLimiter: "real" })
  })

  afterAll(async () => {
    await e2e.close()
  })

  beforeEach(async () => {
    await resetDb(db.pool, ["identity", "_kernel"])
    await seedUser(e2e.app, db.pool, {
      email: EMAIL,
      name: "Devices E2E",
      password: TEST_PASSWORD,
    })
  })

  /**
   * Login opcionalmente já vindo de um device conhecido. Devolve a resposta
   * crua porque a suíte precisa tanto do jar inteiro quanto do valor isolado
   * do cookie de device — é o assunto do arquivo.
   */
  async function loginOnDevice(deviceCookie?: string) {
    const req = e2e.http.post("/v1/auth/login").set("Origin", E2E_ORIGIN)
    if (deviceCookie) req.set("Cookie", `${DEVICE_COOKIE}=${deviceCookie}`)
    return req
      .send({ email: EMAIL, password: TEST_PASSWORD, rememberMe: false })
      .expect(200)
  }

  function listDevices(cookies: string[]) {
    return e2e.http
      .get("/v1/auth/devices")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", cookies)
  }

  it("login sem cookie de device → Set-Cookie de device novo", async () => {
    const res = await loginOnDevice()
    expect(cookieValue(res, DEVICE_COOKIE)).toBeDefined()
    expect(cookieValue(res, SESSION_COOKIE)).toBeDefined()
  })

  it("relogin com o MESMO cookie de device → 1 device, 1 sessão; a anterior morre", async () => {
    const first = await loginOnDevice()
    const deviceCookie = cookieValue(first, DEVICE_COOKIE)
    expect(deviceCookie).toBeDefined()
    const second = await loginOnDevice(deviceCookie)
    // sliding: o mesmo valor de cookie de device volta no 2º login
    expect(cookieValue(second, DEVICE_COOKIE)).toBe(deviceCookie)

    // o relogin revoga a sessão anterior do device → token antigo não autentica
    await listDevices(cookieHeader(first)).expect(401)

    const res = await listDevices(cookieHeader(second)).expect(200)
    const devices = res.body.devices as DeviceItem[]
    expect(devices).toHaveLength(1)
    expect(devices[0]?.activeSessionCount).toBe(1)
    expect(devices[0]?.current).toBe(true)
  })

  it("DELETE /auth/devices/:id derruba as sessões do outro device", async () => {
    const jarA = cookieHeader(await loginOnDevice())
    const jarB = cookieHeader(await loginOnDevice()) // device novo

    const listA = await listDevices(jarA).expect(200)
    const other = (listA.body.devices as DeviceItem[]).find((d) => !d.current)
    // SPEC_DEVIATION: expect(...).toBeDefined() + `!` no lugar de `if (!x) throw`.
    // Reason: vitest/no-conditional-in-test — narrowing continua explícito,
    // só sem `if` dentro do teste.
    expect(other).toBeDefined()

    await e2e.http
      .delete(`/v1/auth/devices/${other!.id}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", jarA)
      .expect(204)

    const after = await listDevices(jarA).expect(200)
    expect(after.body.devices as DeviceItem[]).toHaveLength(1)
    expect((after.body.devices as DeviceItem[])[0]?.current).toBe(true)

    // a sessão de B morreu por cascade do device → 401
    await listDevices(jarB).expect(401)
  })

  it("id de device longo demais → 400, sem chegar ao repositório", async () => {
    const jar = cookieHeader(await loginOnDevice())

    const res = await e2e.http
      .delete(`/v1/auth/devices/${"x".repeat(65)}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", jar)
      .expect(400)
    expect(res.body.type).not.toMatch(/device-not-found$/)

    // a sessão segue viva: a recusa foi de validação, não de autorização
    await listDevices(jar).expect(200)
  })

  it("revogar o device atual → 409", async () => {
    const jar = cookieHeader(await loginOnDevice())
    const list = await listDevices(jar).expect(200)
    const current = (list.body.devices as DeviceItem[]).find((d) => d.current)
    // SPEC_DEVIATION: expect(...).toBeDefined() + `!` no lugar de `if (!x) throw`.
    // Reason: vitest/no-conditional-in-test — narrowing continua explícito,
    // só sem `if` dentro do teste.
    expect(current).toBeDefined()

    await e2e.http
      .delete(`/v1/auth/devices/${current!.id}`)
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", jar)
      .expect(409)
  })

  it("DELETE /auth/devices (outros) mantém o atual e derruba os demais", async () => {
    const jarA = cookieHeader(await loginOnDevice())
    await loginOnDevice() // device B

    await e2e.http
      .delete("/v1/auth/devices")
      .set("Origin", E2E_ORIGIN)
      .set("Cookie", jarA)
      .expect(204)

    const after = await listDevices(jarA).expect(200)
    expect(after.body.devices as DeviceItem[]).toHaveLength(1)
    expect((after.body.devices as DeviceItem[])[0]?.current).toBe(true)
  })
})
