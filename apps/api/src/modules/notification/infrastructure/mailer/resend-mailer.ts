import { Resend } from "resend"

import { MailDeliveryError } from "./mailer.errors"

import type { Mailer } from "../../domain/ports/mailer"
import type { TemplateRenderer } from "../../domain/ports/template-renderer"

export interface ResendOptions {
  apiKey: string
  from: string
}

// Sem @Injectable: instanciado por useFactory (MAILER), não pelo container.
/** Mailer de produção via Resend. Renderiza o template e despacha o HTML. */
export class ResendMailer implements Mailer {
  private readonly resend: Resend
  private readonly from: string

  constructor(
    opts: ResendOptions,
    private readonly renderer: TemplateRenderer,
  ) {
    this.resend = new Resend(opts.apiKey)
    this.from = opts.from
  }

  async sendAccessLink(
    to: string,
    link: string,
    name: string,
    _locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.dispatch(to, "Configure seu acesso à plataforma", "access-link", { name, link }, idempotencyKey)
  }

  async sendPasswordReset(
    to: string,
    link: string,
    _locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.dispatch(to, "Redefinição de senha", "reset", { link }, idempotencyKey)
  }

  async sendEmailVerification(
    to: string,
    link: string,
    _locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.dispatch(to, "Verifique seu e-mail", "verify", { link }, idempotencyKey)
  }

  async sendLockoutNotice(to: string, _locale: string, idempotencyKey?: string): Promise<void> {
    await this.dispatch(to, "Conta bloqueada temporariamente", "lockout", {}, idempotencyKey)
  }

  async sendPasswordChanged(
    to: string,
    at: string,
    _locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.dispatch(
      to,
      "Sua senha foi alterada",
      "password-changed",
      { at: this.formatAt(at) },
      idempotencyKey,
    )
  }

  async sendDeviceNewLogin(
    to: string,
    deviceLabel: string,
    ip: string | null,
    at: string,
    _locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.dispatch(
      to,
      "Novo acesso à sua conta",
      "device-new-login",
      { deviceLabel, ip, at: this.formatAt(at) },
      idempotencyKey,
    )
  }

  async sendEmailChangeConfirmation(
    to: string,
    link: string,
    _locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.dispatch(to, "Confirme seu novo e-mail", "email-change", { link }, idempotencyKey)
  }

  async sendEmailChangeNotice(
    to: string,
    at: string,
    _locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.dispatch(
      to,
      "Solicitação de troca de e-mail",
      "email-change-notice",
      { at: this.formatAt(at) },
      idempotencyKey,
    )
  }

  private formatAt(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso))
  }

  private async dispatch(
    to: string,
    subject: string,
    template: string,
    data: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<void> {
    const html = this.renderer.render(template, data)
    // Crash entre send e UPDATE status=sent → retry re-envia; a chave faz o
    // Resend dedupar (at-least-once vira efetivamente once no provider).
    const { error } = await this.resend.emails.send(
      { from: this.from, to, subject, html },
      idempotencyKey !== undefined ? { idempotencyKey } : undefined,
    )
    if (error) {
      throw new MailDeliveryError(error.message)
    }
  }
}
