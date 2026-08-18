import { Inject, Injectable } from "@nestjs/common"

import { NotificationTemplateSourceRegistry } from "../../application/templates/notification-template-registry"
import { EmailBindingMissingError, EmailRecipientMissingError } from "../../domain/errors"
import { MAILER } from "../../domain/ports/mailer"
import { TEMPLATE_RENDERER } from "../../domain/ports/template-renderer"

import type { NotificationType } from "../../api/events/notification-requested.event"
import type { ChannelPort, ChannelSendInput } from "../../domain/ports/channel.port"
import type { Mailer } from "../../domain/ports/mailer"
import type { TemplateRenderer } from "../../domain/ports/template-renderer"

@Injectable()
export class EmailChannel implements ChannelPort {
  constructor(
    private readonly templateSources: NotificationTemplateSourceRegistry,
    @Inject(TEMPLATE_RENDERER) private readonly renderer: TemplateRenderer,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async send(input: ChannelSendInput): Promise<void> {
    // input.type é string no ChannelPort (canal agnóstico ao domínio), mas
    // dentro do notification é sempre um NotificationType.
    const type = input.type as NotificationType
    const source = this.templateSources.require(type)
    if (!source.email) {
      throw new EmailBindingMissingError(type)
    }
    const { email } = source
    const payload = input.payload

    const to = email.recipient?.(payload) ?? payload.email
    if (typeof to !== "string") {
      throw new EmailRecipientMissingError(type)
    }

    const subject = email.subject(payload)
    const html = this.renderer.render(email.template, email.view?.(payload) ?? payload)
    await this.mailer.send({ to, subject, html, idempotencyKey: input.id })
  }
}
