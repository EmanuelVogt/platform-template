import { fakeRequestContext } from "../../request-context.fixture"

import { ListDevicesUseCase } from "./list-devices.use-case"

import type { DeviceRepository } from "../../../domain/ports/device.repository"
import type { IdentityConfig } from "../../../identity.config"

describe("ListDevicesUseCase", () => {
  it("marca current pelo deviceId do contexto e mapeia para a view", async () => {
    const now = new Date("2026-06-01T00:00:00Z")
    const listActiveByUser = jest.fn().mockResolvedValue([
      {
        id: "d-1",
        firstSeenAt: now,
        lastSeenAt: now,
        ipAddress: "1.1.1.1",
        userAgent: "UA",
        activeSessionCount: 2,
      },
      {
        id: "d-2",
        firstSeenAt: now,
        lastSeenAt: now,
        ipAddress: null,
        userAgent: null,
        activeSessionCount: 1,
      },
    ])
    const devices = { listActiveByUser } as unknown as DeviceRepository
    const ctx = fakeRequestContext(() => ({ userId: "u-1", sessionId: "s-1", deviceId: "d-1" }))
    const clock = { now: () => now }
    const config = {
      SESSION_IDLE_TTL_SECONDS: 100,
      SESSION_ABSOLUTE_TTL_SECONDS: 200,
    } as unknown as IdentityConfig

    const out = await new ListDevicesUseCase(
      devices,
      ctx,
      clock,
      config
    ).execute({})

    expect(listActiveByUser).toHaveBeenCalledWith("u-1", now, 100, 200)
    expect(out.devices[0]).toMatchObject({
      id: "d-1",
      current: true,
      activeSessionCount: 2,
    })
    expect(out.devices[1]?.current).toBe(false)
  })
})
