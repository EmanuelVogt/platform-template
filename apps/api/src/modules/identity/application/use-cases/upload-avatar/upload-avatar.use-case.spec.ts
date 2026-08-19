import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { User, type UserProps } from "../../../domain/entities/user.entity"
import { fakeRequestContext } from "../../request-context.fixture"

import { UploadAvatarUseCase } from "./upload-avatar.use-case"

const NOW = new Date("2026-06-16T00:00:00.000Z")

function makeUser(over: Partial<UserProps> = {}): User {
  return User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "argon2-hash",
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
    birthDate: null,
    avatarAttachmentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    createdByUserId: null,
    ...over,
  })
}

function makeCtx(over: { userId?: string | null; sessionId?: string | null } = {}) {
  const userId = "userId" in over ? over.userId : "u-1"
  const sessionId = "sessionId" in over ? over.sessionId : "sess-1"
  return fakeRequestContext(() => ({
      ip: "1.2.3.4",
      userAgent: "jest",
      correlationId: "c1",
      locale: "pt-BR",
      userId,
      sessionId,
    }))
}

function makeDeps(over: Record<string, any> = {}) {
  const user = over.user !== undefined ? over.user : makeUser()
  const users = over.users ?? {
    findById: jest.fn().mockResolvedValue(user),
    update: jest.fn().mockResolvedValue(undefined),
  }
  const clock = over.clock ?? { now: () => NOW }
  const ctx = over.ctx ?? makeCtx()
  const attachments = over.attachments ?? {
    upload: jest.fn().mockResolvedValue({ id: "att-new" }),
    delete: jest.fn().mockResolvedValue(undefined),
  }
  const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
  const loggerFactory = { forModule: () => logger }

  const uc = new UploadAvatarUseCase(users, clock, ctx, attachments, loggerFactory as never)
  return { uc, users, clock, ctx, attachments, logger }
}

const DUMMY_INPUT = {
  bytes: Buffer.from("img"),
  declaredContentType: "image/jpeg",
  originalFilename: "foto.jpg",
}

describe("UploadAvatarUseCase", () => {
  it("caminho feliz: faz upload, persiste e retorna avatarAttachmentId", async () => {
    const t = makeDeps()
    const out = await t.uc.execute(DUMMY_INPUT)

    expect(out.avatarAttachmentId).toBe("att-new")
    expect(t.attachments.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: DUMMY_INPUT.bytes,
        declaredContentType: "image/jpeg",
        originalFilename: "foto.jpg",
        profile: "avatar",
        ownerUserId: "u-1",
      }),
    )
    expect(t.users.update).toHaveBeenCalledTimes(1)
  })

  it("sem avatar anterior: não chama attachments.delete", async () => {
    const t = makeDeps({ user: makeUser({ avatarAttachmentId: null }) })
    await t.uc.execute(DUMMY_INPUT)
    expect(t.attachments.delete).not.toHaveBeenCalled()
  })

  it("com avatar anterior diferente: remove o antigo após persistir o novo", async () => {
    const t = makeDeps({ user: makeUser({ avatarAttachmentId: "att-old" }) })
    await t.uc.execute(DUMMY_INPUT)

    expect(t.attachments.delete).toHaveBeenCalledWith("att-old")
    // remoção do antigo ocorre APÓS o update no repo
    const updateOrder = t.users.update.mock.invocationCallOrder[0] ?? 0
    const deleteOrder = t.attachments.delete.mock.invocationCallOrder[0] ?? 0
    expect(updateOrder).toBeLessThan(deleteOrder)
  })

  it("mesmo attachment ID: não chama delete (substituição idempotente)", async () => {
    // upload retorna o mesmo id que já estava no user
    const t = makeDeps({
      user: makeUser({ avatarAttachmentId: "att-same" }),
      attachments: {
        upload: jest.fn().mockResolvedValue({ id: "att-same" }),
        delete: jest.fn(),
      },
    })
    await t.uc.execute(DUMMY_INPUT)
    expect(t.attachments.delete).not.toHaveBeenCalled()
  })

  it("falha no delete do avatar antigo não propaga erro (melhor-esforço)", async () => {
    const t = makeDeps({
      user: makeUser({ avatarAttachmentId: "att-old" }),
      attachments: {
        upload: jest.fn().mockResolvedValue({ id: "att-new" }),
        delete: jest.fn().mockRejectedValue(new Error("R2 timeout")),
      },
    })
    await expect(t.uc.execute(DUMMY_INPUT)).resolves.toEqual({
      avatarAttachmentId: "att-new",
    })
  })

  it("contexto sem userId lança ForbiddenError SEM chamar o repo nem upload", async () => {
    const t = makeDeps({ ctx: makeCtx({ userId: null }) })
    await expect(t.uc.execute(DUMMY_INPUT)).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.users.findById).not.toHaveBeenCalled()
    expect(t.attachments.upload).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("contexto sem sessionId lança ForbiddenError SEM chamar o repo nem upload", async () => {
    const t = makeDeps({ ctx: makeCtx({ sessionId: null }) })
    await expect(t.uc.execute(DUMMY_INPUT)).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.users.findById).not.toHaveBeenCalled()
    expect(t.attachments.upload).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("user não encontrado na primeira busca lança ForbiddenError SEM chamar upload", async () => {
    const t = makeDeps({ user: null })
    await expect(t.uc.execute(DUMMY_INPUT)).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.attachments.upload).not.toHaveBeenCalled()
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("user desaparece antes do persistAvatar lança ForbiddenError SEM chamar update", async () => {
    // Primeira findById retorna o user; segunda (dentro de persistAvatar) retorna null
    const users = {
      findById: jest.fn().mockResolvedValueOnce(makeUser()).mockResolvedValueOnce(null),
      update: jest.fn(),
    }
    const t = makeDeps({ users })
    await expect(t.uc.execute(DUMMY_INPUT)).rejects.toBeInstanceOf(ForbiddenError)
    expect(t.users.update).not.toHaveBeenCalled()
  })

  it("falha no upload propaga erro e NÃO chama persistAvatar nem delete", async () => {
    const uploadError = new Error("R2 unavailable")
    const t = makeDeps({
      attachments: {
        upload: jest.fn().mockRejectedValue(uploadError),
        delete: jest.fn(),
      },
    })
    await expect(t.uc.execute(DUMMY_INPUT)).rejects.toThrow("R2 unavailable")
    expect(t.users.update).not.toHaveBeenCalled()
    expect(t.attachments.delete).not.toHaveBeenCalled()
  })

  it("falha no users.update propaga erro e NÃO executa limpeza do avatar antigo", async () => {
    const updateError = new Error("db constraint")
    const users = {
      findById: jest.fn().mockResolvedValue(makeUser({ avatarAttachmentId: "att-old" })),
      update: jest.fn().mockRejectedValue(updateError),
    }
    const t = makeDeps({ users })
    await expect(t.uc.execute(DUMMY_INPUT)).rejects.toThrow("db constraint")
    expect(t.attachments.delete).not.toHaveBeenCalled()
  })

  it("falha no delete do avatar antigo loga warn com previousAvatarId e mensagem de erro", async () => {
    const deleteError = new Error("network timeout")
    const t = makeDeps({
      user: makeUser({ avatarAttachmentId: "att-old" }),
      attachments: {
        upload: jest.fn().mockResolvedValue({ id: "att-new" }),
        delete: jest.fn().mockRejectedValue(deleteError),
      },
    })
    await t.uc.execute(DUMMY_INPUT)
    expect(t.logger.warn).toHaveBeenCalledWith(
      "avatar.cleanup_failed",
      expect.objectContaining({
        previousAvatarId: "att-old",
        error: "network timeout",
      }),
    )
  })

  it("falha no delete com erro não-Error loga warn com String(error)", async () => {
    const t = makeDeps({
      user: makeUser({ avatarAttachmentId: "att-old" }),
      attachments: {
        upload: jest.fn().mockResolvedValue({ id: "att-new" }),
        delete: jest.fn().mockRejectedValue("timeout string"),
      },
    })
    await t.uc.execute(DUMMY_INPUT)
    expect(t.logger.warn).toHaveBeenCalledWith(
      "avatar.cleanup_failed",
      expect.objectContaining({
        previousAvatarId: "att-old",
        error: "timeout string",
      }),
    )
  })
})
