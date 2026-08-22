import { describe, expect, it, vi } from "vitest"

import { CannotRevokeCurrentDeviceError } from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { RevokeDeviceUseCase } from "./revoke-device.use-case"

import type { AuthEventRepository } from "../../../domain/ports/auth-event.repository"
import type { DeviceRepository } from "../../../domain/ports/device.repository"

const makeCtx = (deviceId: string | null) =>
  fakeRequestContext(() => ({
      userId: "u-1",
      sessionId: "s-1",
      deviceId,
      ip: null,
      userAgent: null,
      correlationId: "C",
      traceId: null,
      spanId: null,
      locale: "pt-BR",
    }))

const makeOutbox = () => ({ publish: vi.fn().mockResolvedValue(undefined) })

describe("RevokeDeviceUseCase", () => {
  it("bloqueia revogar o device atual", async () => {
    const deleteById = vi.fn()
    const devices = { deleteById } as unknown as DeviceRepository
    const authEvents = { recordInTx: vi.fn() } as unknown as AuthEventRepository
    const uc = new RevokeDeviceUseCase(
      devices,
      makeOutbox() as never,
      authEvents,
      makeCtx("d-1")
    )
    await expect(uc.execute({ deviceId: "d-1" })).rejects.toBeInstanceOf(
      CannotRevokeCurrentDeviceError
    )
    expect(deleteById).not.toHaveBeenCalled()
  })

  it("revoga outro device, registra device_revoked e publica a notificação", async () => {
    const deleteById = vi.fn().mockResolvedValue(1)
    const recordInTx = vi.fn()
    const outbox = makeOutbox()
    const uc = new RevokeDeviceUseCase(
      { deleteById } as unknown as DeviceRepository,
      outbox as never,
      { recordInTx } as unknown as AuthEventRepository,
      makeCtx("d-1")
    )
    await uc.execute({ deviceId: "d-2" })
    expect(deleteById).toHaveBeenCalledWith("d-2", "u-1")
    expect(recordInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ eventType: "device_revoked" }),
      })
    )
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "notification.requested",
        payload: expect.objectContaining({
          type: "device_revoked",
          recipientId: "u-1",
          data: { deviceId: "d-2" },
        }),
      })
    )
  })

  it("não registra evento nem publica quando nada foi apagado (n=0)", async () => {
    const recordInTx = vi.fn()
    const outbox = makeOutbox()
    const uc = new RevokeDeviceUseCase(
      { deleteById: vi.fn().mockResolvedValue(0) } as unknown as DeviceRepository,
      outbox as never,
      { recordInTx } as unknown as AuthEventRepository,
      makeCtx("d-1")
    )
    await uc.execute({ deviceId: "d-2" })
    expect(recordInTx).not.toHaveBeenCalled()
    expect(outbox.publish).not.toHaveBeenCalled()
  })
})
