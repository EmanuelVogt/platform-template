import { User, type UserProps } from "../../../domain/entities/user.entity"
import { UserNotInTrashError } from "../../../domain/errors"
import { fakeRequestContext } from "../../request-context.fixture"

import { PurgeUsersUseCase } from "./purge-users.use-case"

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Alvo",
    email: "alvo@example.com",
    passwordHash: "argon2",
    pepperVersion: 1,
    status: "active",
    emailVerified: true,
    pendingEmail: null,
    accessProfile: "admin",
    servesClients: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastResetRequestedAt: null,
    lastVerificationRequestedAt: null,
    lastEmailChangeRequestedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: new Date("2026-06-01T00:00:00.000Z"),
    createdByUserId: null,
    birthDate: null,
    avatarAttachmentId: null,
    ...over,
  })
}

function makeDeps(found: User[], withAuditTrail = true) {
  const users = {
    findByIds: jest.fn().mockResolvedValue(found),
    hardDeleteByIds: jest.fn().mockResolvedValue(undefined),
  }
  const authEvents = { recordInTx: jest.fn().mockResolvedValue(undefined) }
  const auditTrail = { purgeEntities: jest.fn().mockResolvedValue(0) }
  const ctx = fakeRequestContext(() => ({
      correlationId: "c1",
      locale: "pt-BR",
      userId: "u-admin",
      ip: "1.2.3.4",
      userAgent: "jest",
    }))
  const uc = new PurgeUsersUseCase(
    users as never,
    authEvents as never,
    ctx,
    withAuditTrail ? auditTrail : null,
  )
  return { uc, users, authEvents, auditTrail }
}

describe("PurgeUsersUseCase", () => {
  it("purga deletados: audita user_purged ANTES do hard delete", async () => {
    const a = makeUser({ id: "u-a" })
    const b = makeUser({ id: "u-b" })
    const { uc, users, authEvents, auditTrail } = makeDeps([a, b])

    const out = await uc.execute({ userIds: ["u-a", "u-b"] })

    expect(out).toEqual({ purged: 2 })
    expect(users.hardDeleteByIds).toHaveBeenCalledWith(["u-a", "u-b"])
    // Purga a trilha do titular (LGPD) após o hard delete, na mesma tx.
    expect(auditTrail.purgeEntities).toHaveBeenCalledWith([
      { table: "users", entityId: "u-a" },
      { table: "users", entityId: "u-b" },
    ])
    const purgeOrder = auditTrail.purgeEntities.mock.invocationCallOrder[0] ?? 0
    expect(users.hardDeleteByIds.mock.invocationCallOrder[0]).toBeLessThan(
      purgeOrder,
    )
    expect(authEvents.recordInTx).toHaveBeenCalledTimes(2)
    expect(authEvents.recordInTx.mock.calls.map((c) => c[0].props.eventType)).toEqual(
      ["user_purged", "user_purged"],
    )
    // Evento gravado antes do delete (mesma tx): ordem das invocações.
    const lastEventOrder = authEvents.recordInTx.mock.invocationCallOrder.at(-1) ?? 0
    const deleteOrder = users.hardDeleteByIds.mock.invocationCallOrder[0]!
    expect(lastEventOrder).toBeLessThan(deleteOrder)
  })

  it("alvo não-deletado → UserNotInTrashError e nada é apagado", async () => {
    const alive = makeUser({ deletedAt: null })
    const { uc, users, authEvents } = makeDeps([alive])

    await expect(uc.execute({ userIds: ["u-1"] })).rejects.toThrow(UserNotInTrashError)
    expect(users.hardDeleteByIds).not.toHaveBeenCalled()
    expect(authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("sem provider de AUDIT_TRAIL_PURGER: purga o usuário e pula a trilha", async () => {
    const a = makeUser({ id: "u-a" })
    const { uc, users, authEvents, auditTrail } = makeDeps([a], false)

    const out = await uc.execute({ userIds: ["u-a"] })

    expect(out).toEqual({ purged: 1 })
    expect(users.hardDeleteByIds).toHaveBeenCalledWith(["u-a"])
    expect(authEvents.recordInTx).toHaveBeenCalledTimes(1)
    expect(auditTrail.purgeEntities).not.toHaveBeenCalled()
  })

  it("ids inexistentes: no-op com purged 0", async () => {
    const { uc, users } = makeDeps([])
    const out = await uc.execute({ userIds: ["x"] })
    expect(out).toEqual({ purged: 0 })
    expect(users.hardDeleteByIds).toHaveBeenCalledWith([])
  })
})
