import { createHash } from "node:crypto"

import { HibpBreachCheck } from "./hibp-breach-check"
import { NoopBreachCheck } from "./noop-breach-check"

function sha1Upper(password: string): string {
  return createHash("sha1").update(password).digest("hex").toUpperCase()
}

function fakeFetch(body: string, ok = true): typeof fetch {
  const response = {
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(body),
  }
  return (() => Promise.resolve(response)) as unknown as typeof fetch
}

describe("NoopBreachCheck", () => {
  it("nunca reporta vazamento", async () => {
    expect(await new NoopBreachCheck().isBreached("qualquer-senha")).toBe(false)
  })
})

describe("HibpBreachCheck — modo de falha", () => {
  it("fail_open retorna false quando a rede falha", async () => {
    const failingFetch = () => {
      throw new Error("rede fora")
    }
    const check = new HibpBreachCheck("fail_open", failingFetch)
    expect(await check.isBreached("senha-123")).toBe(false)
  })

  it("fail_closed retorna true (trata como vazada) quando a rede falha", async () => {
    const failingFetch = () => {
      throw new Error("rede fora")
    }
    const check = new HibpBreachCheck("fail_closed", failingFetch)
    expect(await check.isBreached("senha-123")).toBe(true)
  })
})

describe("HibpBreachCheck — matching k-anonymity", () => {
  const PASSWORD = "senha-vazada-x"
  const suffix = sha1Upper(PASSWORD).slice(5)

  it("suffix presente na range → vazada", async () => {
    const body = `${suffix}:42\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.isBreached(PASSWORD)).toBe(true)
  })

  it("suffix ausente → não vazada", async () => {
    const body = `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.isBreached(PASSWORD)).toBe(false)
  })

  it("suffix em lowercase na resposta → ainda vazada (case-insensitive)", async () => {
    const body = `${suffix.toLowerCase()}:7`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.isBreached(PASSWORD)).toBe(true)
  })

  it("CRLF e padding (Add-Padding count 0) não quebram o match", async () => {
    const body = `0000000000000000000000000000000000A:0\r\n${suffix}:3\r\n`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.isBreached(PASSWORD)).toBe(true)
  })

  it("res.ok=false respeita o modo (fail_open → false)", async () => {
    const check = new HibpBreachCheck("fail_open", fakeFetch("", false))
    expect(await check.isBreached(PASSWORD)).toBe(false)
  })
})
