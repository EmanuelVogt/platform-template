import { describe, expect, it, vi } from "vitest"

import { ConfirmEmailChangeController } from "./confirm-email-change.controller"

import type { ConfirmEmailChangeUseCase } from "../../../application/use-cases/confirm-email-change/confirm-email-change.use-case"
import type { Csrf } from "../../../domain/ports/csrf"
import type { IdentityConfig } from "../../../identity.config"
import type { Request, Response } from "express"

const result = {
  user: { id: "u-1", email: "novo@example.com" },
  sessionToken: "session-token",
  maxAgeSeconds: 3600,
  deviceCookie: "device-token",
  deviceCookieMaxAgeSeconds: 999999,
  sessionId: "s-1",
}

function make(sameSite: "lax" | "none") {
  const useCase = { execute: vi.fn().mockResolvedValue(result) }
  const csrf = { sign: vi.fn().mockReturnValue("csrf-token") }
  const config = {
    DEVICE_COOKIE_NAME: "rit_device",
    COOKIE_NAME: "rit_session",
    COOKIE_SECURE: true,
    COOKIE_SAMESITE: sameSite,
  } as IdentityConfig
  const controller = new ConfirmEmailChangeController(
    useCase as unknown as ConfirmEmailChangeUseCase,
    config,
    csrf as unknown as Csrf
  )
  const res = { cookie: vi.fn() } as unknown as Response
  return { useCase, csrf, controller, res }
}

describe("ConfirmEmailChangeController", () => {
  it("usa o device cookie do request e assina CSRF quando SameSite=none", async () => {
    const { useCase, csrf, controller, res } = make("none")
    const req = { cookies: { rit_device: "dev-abc" } } as unknown as Request

    const out = await controller.handle({ token: "tok" }, req, res)

    expect(useCase.execute).toHaveBeenCalledWith({
      token: "tok",
      deviceCookie: "dev-abc",
    })
    expect(csrf.sign).toHaveBeenCalledWith("s-1")
    expect(out).toEqual({ user: result.user })
  })

  it("deviceCookie = null sem cookies e não assina CSRF quando SameSite=lax", async () => {
    const { useCase, csrf, controller, res } = make("lax")
    const req = { cookies: undefined } as unknown as Request

    await controller.handle({ token: "tok" }, req, res)

    expect(useCase.execute).toHaveBeenCalledWith({
      token: "tok",
      deviceCookie: null,
    })
    expect(csrf.sign).not.toHaveBeenCalled()
  })
})
