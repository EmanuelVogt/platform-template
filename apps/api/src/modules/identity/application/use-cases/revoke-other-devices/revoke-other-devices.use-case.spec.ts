import { RevokeOtherDevicesUseCase } from "./revoke-other-devices.use-case"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { AuthEventRepository } from "../../../domain/ports/auth-event.repository"
import type { DeviceRepository } from "../../../domain/ports/device.repository"

describe("RevokeOtherDevicesUseCase", () => {
  it("apaga os outros devices e registra sessions_revoked_all", async () => {
    const deleteOthers = jest.fn()
    const recordInTx = jest.fn()
    const ctx = {
      get: () => ({
        userId: "u-1",
        sessionId: "s-1",
        deviceId: "d-1",
        ip: null,
        userAgent: null,
        correlationId: "C",
        traceId: null,
        spanId: null,
      }),
    } as unknown as RequestContext
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
