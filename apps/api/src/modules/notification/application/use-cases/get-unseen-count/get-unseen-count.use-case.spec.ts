import { GetUnseenCountUseCase } from "./get-unseen-count.use-case"

import type { RequestContext } from "../../../../../shared/kernel/context/request-context"
import type { NotificationRepositoryPort } from "../../../domain/ports/notification.repository.port"

describe("GetUnseenCountUseCase", () => {
  it("conta não-vistas do recipient logado", async () => {
    const countUnseen = jest.fn().mockResolvedValue(3)
    const repo = { countUnseen } as unknown as NotificationRepositoryPort
    const ctx = { get: () => ({ userId: "u1" }) } as unknown as RequestContext

    const out = await new GetUnseenCountUseCase(repo, ctx).execute()

    expect(countUnseen).toHaveBeenCalledWith("u1")
    expect(out).toEqual({ count: 3 })
  })
})
