import { Injectable } from "@nestjs/common"

import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"

import type { Mailer } from "../../domain/ports/mailer"

/**
 * Mailer de desenvolvimento: registra o envio (incluindo o link) no logger.
 * Aceitável só em dev/MVP — em prod o link de reset NUNCA pode ir pro log (spec §12).
 */
@Injectable()
export class LogMailer implements Mailer {
  private readonly log: AppLogger

  constructor(loggerFactory: LoggerFactory) {
    this.log = loggerFactory.forModule("LogMailer")
  }

  async sendAccessLink(
    to: string,
    link: string,
    name: string,
    locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.log.info("e-mail de link de acesso (dev)", { to, link, name, locale, idempotencyKey })
  }

  async sendPasswordReset(
    to: string,
    link: string,
    locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.log.info("e-mail de reset de senha (dev)", { to, link, locale, idempotencyKey })
  }

  async sendEmailVerification(
    to: string,
    link: string,
    locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.log.info("e-mail de verificação (dev)", { to, link, locale, idempotencyKey })
  }

  async sendLockoutNotice(to: string, locale: string, idempotencyKey?: string): Promise<void> {
    this.log.info("aviso de bloqueio de conta (dev)", { to, locale, idempotencyKey })
  }

  async sendPasswordChanged(
    to: string,
    at: string,
    locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.log.info("e-mail de senha alterada (dev)", { to, at, locale, idempotencyKey })
  }

  async sendDeviceNewLogin(
    to: string,
    deviceLabel: string,
    ip: string | null,
    at: string,
    locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.log.info("e-mail de novo dispositivo (dev)", {
      to,
      deviceLabel,
      ip,
      at,
      locale,
      idempotencyKey,
    })
  }

  async sendEmailChangeConfirmation(
    to: string,
    link: string,
    locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.log.info("e-mail de confirmação de troca de e-mail (dev)", { to, link, locale, idempotencyKey })
  }

  async sendEmailChangeNotice(
    to: string,
    at: string,
    locale: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.log.info("aviso de troca de e-mail (dev)", { to, at, locale, idempotencyKey })
  }
}
