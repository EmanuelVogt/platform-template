import { Inject, Injectable } from "@nestjs/common"

import { MAILER } from "../../domain/ports/mailer"

import type {
  AccessLinkEmailPayload,
  AccountLockoutEmailPayload,
  DeviceNewLoginEmailPayload,
  EmailChangeNoticeEmailPayload,
  EmailChangeRequestedEmailPayload,
  EmailVerificationEmailPayload,
  PasswordChangedEmailPayload,
  PasswordResetEmailPayload,
} from "../../domain/notification-payloads"
import type { ChannelPort, ChannelSendInput } from "../../domain/ports/channel.port"
import type { Mailer } from "../../domain/ports/mailer"

@Injectable()
export class EmailChannel implements ChannelPort {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  async send(input: ChannelSendInput): Promise<void> {
    switch (input.type) {
      case "access_link_sent": {
        const p = input.payload as AccessLinkEmailPayload
        await this.mailer.sendAccessLink(p.email, p.link, p.name, p.locale, input.id)
        return
      }
      case "email_verification": {
        const p = input.payload as EmailVerificationEmailPayload
        await this.mailer.sendEmailVerification(p.email, p.link, p.locale, input.id)
        return
      }
      case "password_reset_requested": {
        const p = input.payload as PasswordResetEmailPayload
        await this.mailer.sendPasswordReset(p.email, p.link, p.locale, input.id)
        return
      }
      case "account_lockout": {
        const p = input.payload as AccountLockoutEmailPayload
        await this.mailer.sendLockoutNotice(p.email, p.locale, input.id)
        return
      }
      case "password_changed": {
        const p = input.payload as PasswordChangedEmailPayload
        await this.mailer.sendPasswordChanged(p.email, p.at, p.locale, input.id)
        return
      }
      case "device_new_login": {
        const p = input.payload as DeviceNewLoginEmailPayload
        await this.mailer.sendDeviceNewLogin(
          p.email,
          p.deviceLabel,
          p.ip,
          p.at,
          p.locale,
          input.id
        )
        return
      }
      case "email_change_requested": {
        const p = input.payload as EmailChangeRequestedEmailPayload
        await this.mailer.sendEmailChangeConfirmation(p.email, p.link, p.locale, input.id)
        return
      }
      case "email_change_notice": {
        const p = input.payload as EmailChangeNoticeEmailPayload
        await this.mailer.sendEmailChangeNotice(p.email, p.at, p.locale, input.id)
        return
      }
      default:
        throw new Error(`tipo sem envio de e-mail implementado: ${input.type}`)
    }
  }
}
