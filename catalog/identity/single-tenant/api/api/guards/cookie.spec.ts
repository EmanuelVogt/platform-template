import { describe, expect, it } from "vitest"

import {
  setSessionCookie,
  clearSessionCookie,
  setCsrfCookie,
  COOKIE_OPTIONS,
} from "./cookie"

import type { Response } from "express"

type Captured = {
  name?: string
  value?: string
  opts?: Record<string, unknown>
}

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
    COOKIE_NAME: "__Host-app_session",
    COOKIE_SECURE: true,
    COOKIE_SAMESITE: "lax" as const,
  }

  it("emite com httpOnly, secure, sameSite, path / e sem domain", () => {
    const c: Captured = {}
    setSessionCookie(makeRes(c), cfg, "raw-token", 3600)
    expect(c.name).toBe("__Host-app_session")
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
    expect(c.name).toBe("__Host-app_session")
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

describe("cookie de CSRF", () => {
  const cfg = {
    COOKIE_NAME: "__Host-app_session",
    COOKIE_SECURE: true,
    COOKIE_SAMESITE: "none" as const,
    CSRF_COOKIE_NAME: "app_csrf",
  }

  it("emite com o nome que veio da config, legível por JS e sem domain", () => {
    const c: Captured = {}
    setCsrfCookie(makeRes(c), cfg, "hmac-token")
    expect(c.name).toBe("app_csrf")
    expect(c.value).toBe("hmac-token")
    expect(c.opts).toMatchObject({
      httpOnly: false,
      secure: true,
      sameSite: "none",
      path: "/",
    })
    expect(c.opts).not.toHaveProperty("domain")
  })

  it("segue o rename do produto em vez de um literal da plataforma", () => {
    const c: Captured = {}
    setCsrfCookie(makeRes(c), { ...cfg, CSRF_COOKIE_NAME: "produto_csrf" }, "t")
    expect(c.name).toBe("produto_csrf")
  })
})
