import { ResendMailer } from "./resend-mailer"

import type { TemplateRenderer } from "../../domain/ports/template-renderer"

jest.mock("resend", () => ({ Resend: jest.fn() }))

describe("ResendMailer", () => {
  const mockRender = jest.fn().mockReturnValue("<html>ok</html>")
  const renderer: TemplateRenderer = { render: mockRender }
  let mailer: ResendMailer
  let send: jest.Mock

  beforeEach(() => {
    send = jest.fn().mockResolvedValue({ data: { id: "e1" }, error: null })
    const { Resend } = jest.requireMock<{ Resend: jest.Mock }>("resend")
    Resend.mockImplementation(() => ({ emails: { send } }))
    mailer = new ResendMailer(
      { apiKey: "re_x", from: "no-reply@example.com" },
      renderer,
    )
    send.mockClear()
    mockRender.mockClear()
  })

  it("sendAccessLink renderiza 'access-link' e envia com from/subject corretos", async () => {
    await mailer.sendAccessLink("ana@x.test", "https://x.test/configurar-senha?token=t", "Ana", "pt-BR", "d1")
    expect(mockRender).toHaveBeenCalledWith("access-link", {
      name: "Ana",
      link: "https://x.test/configurar-senha?token=t",
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

  it("sendPasswordReset usa o template 'reset'", async () => {
    await mailer.sendPasswordReset("ana@x.test", "https://x.test/reset?token=t", "pt-BR")
    expect(mockRender).toHaveBeenCalledWith("reset", {
      link: "https://x.test/reset?token=t",
    })
  })

  it("sendEmailVerification usa o template 'verify'", async () => {
    await mailer.sendEmailVerification("ana@x.test", "https://x.test/v?token=t", "pt-BR", "d3")
    expect(mockRender).toHaveBeenCalledWith("verify", { link: "https://x.test/v?token=t" })
  })

  it("sendLockoutNotice usa o template 'lockout' sem dados sensíveis", async () => {
    await mailer.sendLockoutNotice("ana@x.test", "pt-BR", "d4")
    expect(mockRender).toHaveBeenCalledWith("lockout", {})
  })

  it("sendPasswordChanged formata o instante em pt-BR (America/Sao_Paulo)", async () => {
    await mailer.sendPasswordChanged("ana@x.test", "2026-06-10T18:30:00.000Z", "pt-BR", "d5")
    expect(mockRender).toHaveBeenCalledWith("password-changed", { at: "10/06/2026, 15:30" })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Sua senha foi alterada" }),
      { idempotencyKey: "d5" },
    )
  })

  it("sendDeviceNewLogin passa label/ip e formata o instante", async () => {
    await mailer.sendDeviceNewLogin(
      "ana@x.test",
      "Chrome/Linux",
      null,
      "2026-06-10T18:30:00.000Z",
      "pt-BR",
      "d6",
    )
    expect(mockRender).toHaveBeenCalledWith("device-new-login", {
      deviceLabel: "Chrome/Linux",
      ip: null,
      at: "10/06/2026, 15:30",
    })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Novo acesso à sua conta" }),
      { idempotencyKey: "d6" },
    )
  })

  it("lança quando o provedor retorna erro (domínio não verificado, from inválido)", async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { message: "The example.com domain is not verified", name: "validation_error", statusCode: 403 },
    })
    await expect(
      mailer.sendAccessLink("ana@x.test", "https://x.test/c?token=t", "Ana", "pt-BR")
    ).rejects.toThrow("domain is not verified")
  })
})
