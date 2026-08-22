import { describe, expect, it, vi } from "vitest"

import { AttachmentFacade } from "./attachment.facade"

import type { ListAttachmentAccessLogUseCase } from "../../application/use-cases/list-attachment-access-log/list-attachment-access-log.use-case"

describe("AttachmentFacade.listAccessLog", () => {
  it("delega ao use case (FILE-16)", async () => {
    const result = {
      data: [
        {
          id: "1",
          actorUserId: "user-1",
          actorName: "Ana",
          action: "download" as const,
          occurredAt: new Date("2026-08-01T10:00:00.000Z"),
        },
      ],
    }
    const execute = vi.fn().mockResolvedValue(result)
    const listAccessLogUseCase = {
      execute,
    } as unknown as ListAttachmentAccessLogUseCase

    const facade = new AttachmentFacade(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      listAccessLogUseCase,
    )

    await expect(facade.listAccessLog("att-1")).resolves.toEqual(result)
    expect(execute).toHaveBeenCalledWith({ attachmentId: "att-1" })
  })
})
