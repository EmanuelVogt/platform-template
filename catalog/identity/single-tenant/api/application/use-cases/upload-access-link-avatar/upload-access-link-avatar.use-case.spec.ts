import { InvalidAccessLinkError } from "../../../domain/errors"

import { UploadAccessLinkAvatarUseCase } from "./upload-access-link-avatar.use-case"

const NOW = new Date("2026-06-08T00:00:00.000Z")

const VALID_INPUT = {
  token: "raw",
  bytes: Buffer.from("img"),
  declaredContentType: "image/png",
  originalFilename: "avatar.png",
}

function pendingUserProps() {
  return { props: { id: "u-1", name: "Ana", email: "ana@x.test", status: "pending" } }
}

function makeDeps(over: Record<string, any> = {}) {
  const verificationTokens = over.verificationTokens ?? {
    findActiveByHash: jest.fn().mockResolvedValue({ userId: "u-1", expiresAt: new Date("2099-01-01") }),
  }
  const users = over.users ?? { findById: jest.fn().mockResolvedValue(pendingUserProps()) }
  const tokens = over.tokens ?? { hashOf: jest.fn().mockReturnValue("hash-of-raw") }
  const clock = over.clock ?? { now: () => NOW }
  const attachments = over.attachments ?? { upload: jest.fn().mockResolvedValue({ id: "att-1" }) }
  const uc = new UploadAccessLinkAvatarUseCase(verificationTokens, users, tokens, clock, attachments)
  return { uc, verificationTokens, users, tokens, attachments }
}

describe("UploadAccessLinkAvatarUseCase", () => {
  it("happy: faz upload com ownerUserId do token e retorna attachmentId", async () => {
    const t = makeDeps()
    const result = await t.uc.execute(VALID_INPUT)
    expect(result).toEqual({ attachmentId: "att-1" })
    expect(t.attachments.upload).toHaveBeenCalledWith({
      bytes: VALID_INPUT.bytes,
      declaredContentType: "image/png",
      originalFilename: "avatar.png",
      profile: "access-link-avatar",
      ownerUserId: "u-1",
    })
  })

  it("token inválido/expirado lança InvalidAccessLinkError sem chamar facade", async () => {
    const t = makeDeps({
      verificationTokens: { findActiveByHash: jest.fn().mockResolvedValue(null) },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.attachments.upload).not.toHaveBeenCalled()
  })

  it("token inválido não consulta repositório de usuários", async () => {
    const users = { findById: jest.fn().mockResolvedValue(pendingUserProps()) }
    const t = makeDeps({
      verificationTokens: { findActiveByHash: jest.fn().mockResolvedValue(null) },
      users,
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(users.findById).not.toHaveBeenCalled()
  })

  it("usuário não-pending lança InvalidAccessLinkError sem chamar facade", async () => {
    const t = makeDeps({
      users: { findById: jest.fn().mockResolvedValue({ props: { status: "active" } }) },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.attachments.upload).not.toHaveBeenCalled()
  })

  it("usuário com status suspended lança InvalidAccessLinkError", async () => {
    const t = makeDeps({
      users: { findById: jest.fn().mockResolvedValue({ props: { status: "suspended" } }) },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.attachments.upload).not.toHaveBeenCalled()
  })

  it("token sem user correspondente lança InvalidAccessLinkError", async () => {
    const t = makeDeps({
      users: { findById: jest.fn().mockResolvedValue(null) },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.attachments.upload).not.toHaveBeenCalled()
  })

  it("user undefined (porta retorna undefined) lança InvalidAccessLinkError", async () => {
    const t = makeDeps({
      users: { findById: jest.fn().mockResolvedValue(undefined) },
    })
    await expect(t.uc.execute(VALID_INPUT)).rejects.toBeInstanceOf(InvalidAccessLinkError)
    expect(t.attachments.upload).not.toHaveBeenCalled()
  })
})
