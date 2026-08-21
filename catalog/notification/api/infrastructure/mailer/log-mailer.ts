import { Injectable } from "@nestjs/common"

import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"

import type { EmailMessage, Mailer } from "../../domain/ports/mailer"

const HREF_PATTERN = /href="([^"]+)"/g

/**
 * Mailer de desenvolvimento: registra o envio (incluindo os links) no logger.
 * Aceitável só em dev/MVP — em prod o link de reset NUNCA pode ir pro log (spec §12).
 */
@Injectable()
export class LogMailer implements Mailer {
  private readonly log: AppLogger

  constructor(loggerFactory: LoggerFactory) {
    this.log = loggerFactory.forModule("LogMailer")
  }

  async send(message: EmailMessage): Promise<void> {
    const links = [...message.html.matchAll(HREF_PATTERN)].map((match) => match[1])
    this.log.info("e-mail (dev)", {
      to: message.to,
      subject: message.subject,
      idempotencyKey: message.idempotencyKey,
      links,
    })
  }
}
