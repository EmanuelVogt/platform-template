import { Attachment } from "./attachment.entity"

describe("Attachment", () => {
  const base = {
    storageKey: "attachments/abc",
    contentType: "image/png",
    sizeBytes: 10,
    checksum: "deadbeef",
    originalFilename: "a.png",
    profile: "avatar" as const,
    visibility: "authenticated" as const,
    ownerUserId: "u-1",
  }

  it("create gera id, status ready e timestamps", () => {
    const a = Attachment.create(base)
    expect(a.props.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/) // ULID
    expect(a.props.status).toBe("ready")
    expect(a.props.storageKey).toBe("attachments/abc")
  })

  it("é imutável (props congeladas)", () => {
    const a = Attachment.create(base)
    expect(() => {
      ;(a.props as { status: string }).status = "deleted"
    }).toThrow()
  })

  it("markDeleted retorna nova instância deleted", () => {
    const a = Attachment.create(base)
    const d = a.markDeleted()
    expect(d.props.status).toBe("deleted")
    expect(a.props.status).toBe("ready") // original intacto
  })

  it("nasce pendente, sem checksum, com storageKey derivado do id", () => {
    const pending = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 1234,
      originalFilename: "relatório.pdf",
      profile: "feedback-attachment",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    expect(pending.props.status).toBe("pending")
    expect(pending.props.checksum).toBeNull()
    expect(pending.props.profile).toBe("feedback-attachment")
    expect(pending.props.storageKey).toBe(`attachments/${pending.props.id}`)
  })

  it("markReady grava tamanho real e checksum sem mutar a instância anterior", () => {
    const pending = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 1234,
      originalFilename: null,
      profile: "feedback-attachment",
      visibility: "restricted",
      ownerUserId: "user-1",
    })
    const ready = pending.markReady(1200, "abc123")

    expect(ready.props.status).toBe("ready")
    expect(ready.props.sizeBytes).toBe(1200)
    expect(ready.props.checksum).toBe("abc123")
    expect(pending.props.status).toBe("pending")
    expect(ready).not.toBe(pending)
  })

  it("withUploadedSize devolve nova instância pendente com o tamanho medido", () => {
    const pending = Attachment.createPending({
      contentType: "application/pdf",
      sizeBytes: 0,
      originalFilename: "relato.pdf",
      profile: "feedback-attachment",
      visibility: "restricted",
      ownerUserId: "user-1",
    })

    const measured = pending.withUploadedSize(4321)

    expect(measured).not.toBe(pending)
    expect(measured.props.sizeBytes).toBe(4321)
    expect(measured.props.status).toBe("pending")
    expect(measured.props.id).toBe(pending.props.id)
    expect(measured.props.storageKey).toBe(pending.props.storageKey)
    expect(pending.props.sizeBytes).toBe(0)
  })
})
