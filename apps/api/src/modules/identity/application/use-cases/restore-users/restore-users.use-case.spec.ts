import { User, type UserProps } from "../../../domain/entities/user.entity"

import { RestoreUsersUseCase } from "./restore-users.use-case"

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

function makeDeps(found: User[]) {
  const users = {
    findByIds: jest.fn().mockResolvedValue(found),
    update: jest.fn().mockResolvedValue(undefined),
  }
  const authEvents = { recordInTx: jest.fn().mockResolvedValue(undefined) }
  const ctx = {
    get: () => ({
      correlationId: "c1",
      locale: "pt-BR",
      userId: "u-admin",
      ip: "1.2.3.4",
      userAgent: "jest",
    }),
  }
  const uc = new RestoreUsersUseCase(users as never, authEvents as never, ctx as never)
  return { uc, users, authEvents }
}

describe("RestoreUsersUseCase", () => {
  it("restaura só os soft-deleted e audita user_restored por usuário", async () => {
    const dead = makeUser({ id: "u-dead" })
    const alive = makeUser({ id: "u-alive", deletedAt: null })
    const { uc, users, authEvents } = makeDeps([dead, alive])

    const out = await uc.execute({ userIds: ["u-dead", "u-alive"] })

    expect(out).toEqual({ restored: 1 })
    expect(users.update).toHaveBeenCalledTimes(1)
    const updated = users.update.mock.calls[0][0] as User
    expect(updated.props.id).toBe("u-dead")
    expect(updated.isDeleted()).toBe(false)
    expect(authEvents.recordInTx).toHaveBeenCalledTimes(1)
    expect(authEvents.recordInTx.mock.calls[0][0].props.eventType).toBe("user_restored")
    expect(authEvents.recordInTx.mock.calls[0][0].props.actorUserId).toBe("u-admin")
  })

  it("ids inexistentes: no-op com restored 0", async () => {
    const { uc, users } = makeDeps([])
    const out = await uc.execute({ userIds: ["x"] })
    expect(out).toEqual({ restored: 0 })
    expect(users.update).not.toHaveBeenCalled()
  })
})
