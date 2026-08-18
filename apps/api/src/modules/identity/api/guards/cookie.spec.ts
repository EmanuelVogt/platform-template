import { setSessionCookie, clearSessionCookie, COOKIE_OPTIONS } from "./cookie"

import type { Response } from "express"

type Captured = { name?: string; value?: string; opts?: Record<string, unknown> }

function makeRes(captured: Captured) {
  return {
    cookie(name: string, value: string, opts: Record<string, unknown>) {
      captured.name = name
      captured.value = value
      captured.opts = opts
    },
  } as unknown as Response
}

describe("cookie de sessão", () => {
  const cfg = {
    COOKIE_NAME: "__Host-rit_session",
    COOKIE_SECURE: true,
    COOKIE_SAMESITE: "lax" as const,
  }

  it("emite com httpOnly, secure, sameSite, path / e sem domain", () => {
    const c: Captured = {}
    setSessionCookie(makeRes(c), cfg, "raw-token", 3600)
    expect(c.name).toBe("__Host-rit_session")
    expect(c.value).toBe("raw-token")
    expect(c.opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600 * 1000,
    })
    expect(c.opts).not.toHaveProperty("domain")
  })

  it("limpa com os MESMOS atributos (sem domain, maxAge 0)", () => {
    const c: Captured = {}
    clearSessionCookie(makeRes(c), cfg)
    expect(c.name).toBe("__Host-rit_session")
    expect(c.value).toBe("")
    expect(c.opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })
    expect(c.opts).not.toHaveProperty("domain")
  })

  it("COOKIE_OPTIONS não inclui domain", () => {
    expect(COOKIE_OPTIONS(cfg)).not.toHaveProperty("domain")
  })
})
