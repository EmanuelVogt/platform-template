import { describe, expect, it } from "vitest"

import { maintenanceRegistry } from "../../../../shared/kernel/scheduling/maintenance-registry"

import "./purge-auth-events.job"
import "./revert-expired-email-changes.job"

describe("jobs de manutenção do identity no MaintenanceRegistry", () => {
  it("registra auth-events.purge com o horário e o lock da v0.2", () => {
    expect(maintenanceRegistry.require("auth-events.purge")).toEqual({
      cron: "45 3 * * *",
      lockId: 5,
    })
  })

  it("registra email-change.revert com o horário e o lock da v0.2", () => {
    expect(maintenanceRegistry.require("email-change.revert")).toEqual({
      cron: "*/15 * * * *",
      lockId: 4,
    })
  })

  it("não colide com os lockIds do kernel", () => {
    const identityLocks = [
      maintenanceRegistry.require("auth-events.purge").lockId,
      maintenanceRegistry.require("email-change.revert").lockId,
    ]
    const kernelLocks = [
      maintenanceRegistry.require("outbox.purge").lockId,
      maintenanceRegistry.require("idempotency.purge").lockId,
    ]
    expect(identityLocks.some((lock) => kernelLocks.includes(lock))).toBe(false)
  })
})
