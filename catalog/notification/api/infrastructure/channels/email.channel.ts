import { Inject, Injectable } from "@nestjs/common"

import { EmailBindingMissingError, EmailRecipientMissingError } from "../../domain/errors"
import { MAILER } from "../../domain/ports/mailer"
import { NOTIFICATION_TEMPLATE_SOURCES } from "../../domain/ports/notification-template-source.port"
import { TEMPLATE_RENDERER } from "../../domain/ports/template-renderer"

import type { ChannelPort, ChannelSendInput } from "../../domain/ports/channel.port"
import type { Mailer } from "../../domain/ports/mailer"
import type { NotificationTemplateSources } from "../../domain/ports/notification-template-source.port"
import type { TemplateRenderer } from "../../domain/ports/template-renderer"

@Injectable()
export class EmailChannel implements ChannelPort {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_SOURCES)
    private readonly templateSources: NotificationTemplateSources,
    @Inject(TEMPLATE_RENDERER) private readonly renderer: TemplateRenderer,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async send(input: ChannelSendInput): Promise<void> {
    const { type } = input
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
