import { CancelAccessLinkController } from "./cancel-access-link.controller"
import { ConfirmEmailChangeController } from "./confirm-email-change.controller"
import { ForgotPasswordController } from "./forgot-password.controller"
import { LoginController } from "./login.controller"
import { ResetPasswordController } from "./reset-password.controller"
import { SetPasswordController } from "./set-password.controller"
import { UploadAccessLinkAvatarController } from "./upload-access-link-avatar.controller"
import { ValidateAccessLinkController } from "./validate-access-link.controller"
import { ValidateEmailChangeController } from "./validate-email-change.controller"
import { VerifyEmailController } from "./verify-email.controller"

/** Rotas públicas de auth (login, reset/verify, link de acesso, troca de e-mail) — base `/auth`. */
export const AUTH_CONTROLLERS = [
  LoginController,
  ForgotPasswordController,
  ResetPasswordController,
  VerifyEmailController,
  ValidateAccessLinkController,
  SetPasswordController,
  CancelAccessLinkController,
  UploadAccessLinkAvatarController,
  ValidateEmailChangeController,
  ConfirmEmailChangeController,
]
