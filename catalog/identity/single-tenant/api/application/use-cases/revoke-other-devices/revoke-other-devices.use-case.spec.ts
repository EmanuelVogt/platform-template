import { describe, expect, it, vi } from "vitest"

import { fakeRequestContext } from "../../request-context.fixture"

import { RevokeOtherDevicesUseCase } from "./revoke-other-devices.use-case"

import type { AuthEventRepository } from "../../../domain/ports/auth-event.repository"
import type { DeviceRepository } from "../../../domain/ports/device.repository"

describe("RevokeOtherDevicesUseCase", () => {
  it("apaga os outros devices e registra sessions_revoked_all", async () => {
    const deleteOthers = vi.fn()
    const recordInTx = vi.fn()
    const ctx = fakeRequestContext(() => ({
        userId: "u-1",
        sessionId: "s-1",
        deviceId: "d-1",
        ip: null,
        userAgent: null,
        correlationId: "C",
        traceId: null,
        spanId: null,
      }))
    const uc = new RevokeOtherDevicesUseCase(
      { deleteOthers } as unknown as DeviceRepository,
      { recordInTx } as unknown as AuthEventRepository,
      ctx
    )
    await uc.execute({})
    expect(deleteOthers).toHaveBeenCalledWith("u-1", "d-1")
    expect(recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "sessions_revoked_all" }),
      })
    )
  })
})
