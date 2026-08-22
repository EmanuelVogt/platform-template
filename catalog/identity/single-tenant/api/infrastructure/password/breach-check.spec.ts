import { createHash } from "node:crypto"

import { BreachCheckUnavailableError } from "../../domain/errors"

import { HibpBreachCheck } from "./hibp-breach-check"
import { NoopBreachCheck } from "./noop-breach-check"
import { describe, expect, it } from "vitest"

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

/** Nunca responde: só rejeita quando o AbortSignal do adapter dispara. */
const fetchThatOnlyAborts = ((_url: string, init?: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new Error("aborted"))
    })
  })) as unknown as typeof fetch

describe("NoopBreachCheck", () => {
  it("nunca reporta vazamento", async () => {
    expect(await new NoopBreachCheck().check("qualquer-senha")).toBe("clear")
  })
})

describe("HibpBreachCheck — modo de falha", () => {
  const failingFetch = () => {
    throw new Error("rede fora")
  }

  it("fail_open devolve 'skipped' quando a rede falha", async () => {
    const check = new HibpBreachCheck("fail_open", failingFetch)
    expect(await check.check("senha-123")).toBe("skipped")
  })

  it("fail_closed lança BreachCheckUnavailableError quando a rede falha", async () => {
    const check = new HibpBreachCheck("fail_closed", failingFetch)
    const error = await check
      .check("senha-123")
      .then(() => null)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BreachCheckUnavailableError)
    expect(error).toMatchObject({ status: 503, retryAfterSeconds: 5 })
  })

  it("falha de rede NUNCA vira 'breached' — o usuário não paga pela queda", async () => {
    const check = new HibpBreachCheck("fail_open", failingFetch)
    expect(await check.check("senha-123")).not.toBe("breached")
  })
})

describe("HibpBreachCheck — matching k-anonymity", () => {
  const PASSWORD = "senha-vazada-x"
  const suffix = sha1Upper(PASSWORD).slice(5)

  it("suffix presente na range → 'breached'", async () => {
    const body = `${suffix}:42\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.check(PASSWORD)).toBe("breached")
  })

  it("suffix ausente → 'clear'", async () => {
    const body = `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.check(PASSWORD)).toBe("clear")
  })

  it("suffix em lowercase na resposta → ainda 'breached' (case-insensitive)", async () => {
    const body = `${suffix.toLowerCase()}:7`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.check(PASSWORD)).toBe("breached")
  })

  it("CRLF e padding (Add-Padding count 0) não quebram o match", async () => {
    const body = `0000000000000000000000000000000000A:0\r\n${suffix}:3\r\n`
    const check = new HibpBreachCheck("fail_open", fakeFetch(body))
    expect(await check.check(PASSWORD)).toBe("breached")
  })

  it("res.ok=false respeita o modo (fail_open → 'skipped')", async () => {
    const check = new HibpBreachCheck("fail_open", fakeFetch("", false))
    expect(await check.check(PASSWORD)).toBe("skipped")
  })

  it("res.ok=false sob fail_closed lança, não vira veredito", async () => {
    const check = new HibpBreachCheck("fail_closed", fakeFetch("", false))
    await expect(check.check(PASSWORD)).rejects.toBeInstanceOf(
      BreachCheckUnavailableError,
    )
  })
})

describe("HibpBreachCheck — timeout de 2 s", () => {
  it("aborta a consulta pendurada em ~2 s e trata como erro, não como 'clear'", async () => {
    const check = new HibpBreachCheck("fail_open", fetchThatOnlyAborts)
    const startedAt = Date.now()

    const verdict = await check.check("senha-123")

    const elapsed = Date.now() - startedAt
    expect(verdict).toBe("skipped")
    expect(elapsed).toBeGreaterThanOrEqual(1900)
    expect(elapsed).toBeLessThan(2600)
  }, 10_000)

  it("sob fail_closed o estouro do timeout vira 503, nunca 'breached'", async () => {
    const check = new HibpBreachCheck("fail_closed", fetchThatOnlyAborts)
    await expect(check.check("senha-123")).rejects.toBeInstanceOf(
      BreachCheckUnavailableError,
    )
  }, 10_000)
})
