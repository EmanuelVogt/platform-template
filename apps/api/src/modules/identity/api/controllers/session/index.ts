import { AccessHistoryController } from "./access-history.controller"
import { ChangePasswordController } from "./change-password.controller"
import { GetSessionController } from "./get-session.controller"
import { LogoutController } from "./logout.controller"
import { RequestEmailChangeController } from "./request-email-change.controller"
import { ResendVerificationController } from "./resend-verification.controller"
import { UpdateMyProfileController } from "./update-my-profile.controller"
import { UploadAvatarController } from "./upload-avatar.controller"

/** Rotas autenticadas de sessão/conta (sessão atual, logout, senha, perfil, e-mail). */
export const SESSION_CONTROLLERS = [
  GetSessionController,
  LogoutController,
  ChangePasswordController,
  ResendVerificationController,
  AccessHistoryController,
  UpdateMyProfileController,
  UploadAvatarController,
  RequestEmailChangeController,
]
