import type { EmailMessage } from "../../notification/domain/ports/mailer"

export type SentMail = { sent: EmailMessage[] }

export type TokenFromMailOptions = {
  /** Casa por assunto quando a mesma caixa recebe mais de um tipo de e-mail. */
  subject?: string
  /** Nome do parâmetro na query do link. */
  param?: string
}

const LINK = /https?:\/\/[^"'\s<>]+/

/**
 * Extrai o token do link do último e-mail enviado ao destinatário. Casar por
 * destinatário + assunto é obrigatório: um login dispara `device_new_login` e
 * desloca o índice de quem lê `sent[0]`.
 */
export function tokenFromMail(
  mailer: SentMail,
  to: string,
  opts: TokenFromMailOptions = {}
): string {
  const matches = mailer.sent.filter(
    (message) =>
      message.to === to &&
      (opts.subject === undefined || message.subject === opts.subject)
  )
  const message = matches.at(-1)
  if (message === undefined) {
    const seen = mailer.sent.map((m) => `${m.to} / ${m.subject}`).join(" | ")
    throw new Error(
      `tokenFromMail: nenhum e-mail para ${to}${opts.subject ? ` com assunto "${opts.subject}"` : ""}. Enviados: ${seen || "nenhum"}`
    )
  }
  const link = LINK.exec(message.html)?.[0]
  if (link === undefined) {
    throw new Error(`tokenFromMail: o e-mail para ${to} não tem link`)
  }
  const token = new URL(link).searchParams.get(opts.param ?? "token")
  if (token === null) {
    throw new Error(
      `tokenFromMail: o link do e-mail para ${to} não traz ${opts.param ?? "token"} — ${link}`
    )
  }
  return token
}
