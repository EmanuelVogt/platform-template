import { AttachmentFacade } from "../api/facades/attachment.facade"
import {
  attachmentAccessActionSchema,
  attachmentAccessEntrySchema,
} from "../api/contracts/attachment-access-log.contract"

describe("attachment — log de acesso (contrato para consumidores como audit)", () => {
  it("expõe AttachmentFacade.listAccessLog(attachmentId)", () => {
    expect(typeof AttachmentFacade.prototype.listAccessLog).toBe("function")
    expect(AttachmentFacade.prototype.listAccessLog).toHaveLength(1)
  })

  it("mantém as ações de acesso rastreadas", () => {
    expect(attachmentAccessActionSchema.options).toEqual(["download", "upload", "delete"])
  })

  it("mantém a forma de uma entrada do log de acesso", () => {
    expect(Object.keys(attachmentAccessEntrySchema.shape)).toEqual([
      "id",
      "actorUserId",
      "actorName",
      "action",
      "occurredAt",
    ])
  })
})
