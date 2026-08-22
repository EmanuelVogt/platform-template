import { type Mock, beforeEach, describe, expect, it, vi } from "vitest"

import { AvatarFileRequiredError } from "../../../domain/errors"

import { UploadAvatarController } from "./upload-avatar.controller"

import type { UploadAvatarUseCase } from "../../../application/use-cases/upload-avatar/upload-avatar.use-case"

function makeFile(mimetype: string): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "foto.png",
    encoding: "7bit",
    mimetype,
    size: 10,
    buffer: Buffer.from("img"),
  } as unknown as Express.Multer.File
}

describe("UploadAvatarController", () => {
  let useCase: { execute: Mock }
  let controller: UploadAvatarController

  beforeEach(() => {
    useCase = { execute: vi.fn() }
    controller = new UploadAvatarController(useCase as unknown as UploadAvatarUseCase)
  })

  it("rejeita quando nenhum arquivo é enviado", async () => {
    await expect(controller.handle(undefined)).rejects.toBeInstanceOf(
      AvatarFileRequiredError,
    )
    expect(useCase.execute).not.toHaveBeenCalled()
  })

  it("encaminha bytes/contentType/filename ao use case para mime permitido", async () => {
    useCase.execute.mockResolvedValue({ avatarAttachmentId: "att-1" })
    const file = makeFile("image/png")

    const result = await controller.handle(file)

    expect(useCase.execute).toHaveBeenCalledWith({
      bytes: file.buffer,
      declaredContentType: "image/png",
      originalFilename: "foto.png",
    })
    expect(result).toEqual({ avatarAttachmentId: "att-1" })
  })
})
