import { type Mock, beforeEach, describe, expect, it, vi } from "vitest"

import { ResendMailer } from "./resend-mailer"

vi.mock("resend", () => ({ Resend: vi.fn() }))

describe("ResendMailer", () => {
  let mailer: ResendMailer
  let send: Mock

  beforeEach(async () => {
    send = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null })
    const { Resend } = await vi.importMock<{ Resend: Mock }>("resend")
    // SPEC_DEVIATION: mock passa a usar `function` em vez de arrow function.
    // Reason: Vitest não constrói (`new`) um mock cuja implementação é uma arrow function.
    Resend.mockImplementation(function () {
      return { emails: { send } }
    })
    mailer = new ResendMailer({ apiKey: "re_x", from: "no-reply@example.com" })
    send.mockClear()
  })

  it("envia to/subject/html com o from configurado e a idempotencyKey do provider", async () => {
    await mailer.send({
      to: "ana@x.test",
      subject: "Configure seu acesso à plataforma",
      html: "<html>ok</html>",
      idempotencyKey: "d1",
    })
    expect(send).toHaveBeenCalledWith(
      {
        from: "no-reply@example.com",
        to: "ana@x.test",
        subject: "Configure seu acesso à plataforma",
        html: "<html>ok</html>",
      },
      { idempotencyKey: "d1" },
    )
  })

  it("sem idempotencyKey, chama o provider sem a option", async () => {
    await mailer.send({ to: "ana@x.test", subject: "Assunto", html: "<html></html>" })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@x.test" }), undefined)
  })

  it("lança MailDeliveryError quando o provedor retorna erro", async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { message: "The example.com domain is not verified", name: "validation_error", statusCode: 403 },
    })
    await expect(
      mailer.send({ to: "ana@x.test", subject: "Assunto", html: "<html></html>" }),
    ).rejects.toThrow("domain is not verified")
  })
})
