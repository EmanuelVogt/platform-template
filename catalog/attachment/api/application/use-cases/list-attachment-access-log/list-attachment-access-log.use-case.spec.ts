import { ListAttachmentAccessLogUseCase } from "./list-attachment-access-log.use-case"

import type { UserDirectoryFacade } from "../../../../identity/api/facades/user-directory.facade"
import type {
  AttachmentAccessLogListItem,
  AttachmentAccessLogRepository,
} from "../../../domain/ports/attachment-access-log.repository"

function makeUseCase(rows: AttachmentAccessLogListItem[], names: Map<string, string>) {
  const listByAttachment = jest.fn().mockResolvedValue(rows)
  const findNamesByIds = jest.fn().mockResolvedValue(names)
  const repo = { listByAttachment } as unknown as AttachmentAccessLogRepository
  const users = { findNamesByIds } as unknown as UserDirectoryFacade

  return {
    useCase: new ListAttachmentAccessLogUseCase(repo, users),
    listByAttachment,
    findNamesByIds,
  }
}

describe("ListAttachmentAccessLogUseCase", () => {
  it("resolve nomes em uma chamada em lote, sem N+1 (FILE-16)", async () => {
    const { useCase, findNamesByIds, listByAttachment } = makeUseCase(
      [
        {
          id: "1",
          attachmentId: "att-1",
          userId: "user-a",
          action: "download",
          occurredAt: new Date("2026-08-01T10:00:00.000Z"),
        },
        {
          id: "2",
          attachmentId: "att-1",
          userId: "user-b",
          action: "download",
          occurredAt: new Date("2026-08-01T09:00:00.000Z"),
        },
        {
          id: "3",
          attachmentId: "att-1",
          userId: "user-a",
          action: "download",
          occurredAt: new Date("2026-08-01T08:00:00.000Z"),
        },
      ],
      new Map([
        ["user-a", "Ana"],
        ["user-b", "Bruno"],
      ]),
    )

    const result = await useCase.execute({ attachmentId: "att-1" })

    expect(listByAttachment).toHaveBeenCalledWith("att-1", 50)
    expect(findNamesByIds).toHaveBeenCalledTimes(1)
    expect(findNamesByIds).toHaveBeenCalledWith(["user-a", "user-b"])
    expect(result.data.map((e) => e.actorName)).toEqual(["Ana", "Bruno", "Ana"])
  })

  it("acesso sem usuário devolve actorName null (FILE-17)", async () => {
    const { useCase, findNamesByIds } = makeUseCase(
      [
        {
          id: "1",
          attachmentId: "att-1",
          userId: null,
          action: "download",
          occurredAt: new Date("2026-08-01T10:00:00.000Z"),
        },
      ],
      new Map(),
    )

    const result = await useCase.execute({ attachmentId: "att-1" })

    expect(findNamesByIds).not.toHaveBeenCalled()
    expect(result.data).toEqual([
      {
        id: "1",
        actorUserId: null,
        actorName: null,
        action: "download",
        occurredAt: new Date("2026-08-01T10:00:00.000Z"),
      },
    ])
  })

  it("lista vazia é resultado válido, não erro (FILE-18)", async () => {
    const { useCase } = makeUseCase([], new Map())

    await expect(useCase.execute({ attachmentId: "att-empty" })).resolves.toEqual({
      data: [],
    })
  })
})
