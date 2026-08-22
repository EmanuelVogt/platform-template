import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"

import { ACCESS_POLICY } from "../../shared/kernel/access/access-policy.port"
import { RateLimitGuard } from "../../shared/kernel/rate-limit/rate-limit.guard"
import { RateLimitModule } from "../../shared/kernel/rate-limit/rate-limit.module"

import { IdentityAccessPolicy } from "./api/access/identity-access.policy"
import { CONTROLLERS } from "./api/controllers"
import { ProfessionalDirectoryFacade } from "./api/facades/professional-directory.facade"
import { UsageAccessFacade } from "./api/facades/usage-access.facade"
import { UserDirectoryFacade } from "./api/facades/user-directory.facade"
import { CsrfGuard } from "./api/guards/csrf.guard"
import {
  AUTH_MIDDLEWARE_ROUTE,
  AuthMiddleware,
} from "./api/middleware/auth.middleware"
import { PurgeAuthEventsJob } from "./application/jobs/purge-auth-events.job"
import { RevertExpiredEmailChangesJob } from "./application/jobs/revert-expired-email-changes.job"
import { CreateSessionService } from "./application/services/create-session.service"
import { CancelAccessLinkUseCase } from "./application/use-cases/cancel-access-link/cancel-access-link.use-case"
import { ChangePasswordUseCase } from "./application/use-cases/change-password/change-password.use-case"
import { ConfirmEmailChangeUseCase } from "./application/use-cases/confirm-email-change/confirm-email-change.use-case"
import { CreatePermissionTemplateUseCase } from "./application/use-cases/create-permission-template/create-permission-template.use-case"
import { CreateUserUseCase } from "./application/use-cases/create-user/create-user.use-case"
import { DeletePermissionTemplateUseCase } from "./application/use-cases/delete-permission-template/delete-permission-template.use-case"
import { DeleteUserUseCase } from "./application/use-cases/delete-user/delete-user.use-case"
import { GetCurrentUserUseCase } from "./application/use-cases/get-current-user/get-current-user.use-case"
import { GetPermissionTemplateUseCase } from "./application/use-cases/get-permission-template/get-permission-template.use-case"
import { ListAccessHistoryUseCase } from "./application/use-cases/list-access-history/list-access-history.use-case"
import { ListDevicesUseCase } from "./application/use-cases/list-devices/list-devices.use-case"
import { ListPermissionTemplatesUseCase } from "./application/use-cases/list-permission-templates/list-permission-templates.use-case"
import { ListUsersUseCase } from "./application/use-cases/list-users/list-users.use-case"
import { LoginUseCase } from "./application/use-cases/login/login.use-case"
import { LogoutUseCase } from "./application/use-cases/logout/logout.use-case"
import { PurgeUsersUseCase } from "./application/use-cases/purge-users/purge-users.use-case"
import { RequestEmailChangeUseCase } from "./application/use-cases/request-email-change/request-email-change.use-case"
import { RequestPasswordResetUseCase } from "./application/use-cases/request-password-reset/request-password-reset.use-case"
import { ResendAccessLinkUseCase } from "./application/use-cases/resend-access-link/resend-access-link.use-case"
import { ResendVerificationUseCase } from "./application/use-cases/resend-verification/resend-verification.use-case"
import { ResetPasswordUseCase } from "./application/use-cases/reset-password/reset-password.use-case"
import { RestoreUsersUseCase } from "./application/use-cases/restore-users/restore-users.use-case"
import { RevokeDeviceUseCase } from "./application/use-cases/revoke-device/revoke-device.use-case"
import { RevokeOtherDevicesUseCase } from "./application/use-cases/revoke-other-devices/revoke-other-devices.use-case"
import { SetPasswordUseCase } from "./application/use-cases/set-password/set-password.use-case"
import { UpdateMyProfileUseCase } from "./application/use-cases/update-my-profile/update-my-profile.use-case"
import { UpdatePermissionTemplateUseCase } from "./application/use-cases/update-permission-template/update-permission-template.use-case"
import { UpdateUserUseCase } from "./application/use-cases/update-user/update-user.use-case"
import { UploadAccessLinkAvatarUseCase } from "./application/use-cases/upload-access-link-avatar/upload-access-link-avatar.use-case"
import { UploadAvatarUseCase } from "./application/use-cases/upload-avatar/upload-avatar.use-case"
import { ValidateAccessLinkQuery } from "./application/use-cases/validate-access-link/validate-access-link.use-case"
import { ValidateEmailChangeQuery } from "./application/use-cases/validate-email-change/validate-email-change.use-case"
import { VerifyEmailUseCase } from "./application/use-cases/verify-email/verify-email.use-case"
import { AUTH_EVENT_REPOSITORY } from "./domain/ports/auth-event.repository"
import { BREACH_CHECK } from "./domain/ports/breach-check"
import { CSRF, type Csrf } from "./domain/ports/csrf"
import { DEVICE_REPOSITORY } from "./domain/ports/device.repository"
import { PASSWORD_HASHER } from "./domain/ports/password-hasher"
import { PASSWORD_STRENGTH } from "./domain/ports/password-strength"
import { PERMISSION_TEMPLATE_REPOSITORY } from "./domain/ports/permission-template.repository"
import { PROFESSIONAL_COMMITMENTS } from "./domain/ports/professional-commitments.port"
import { PROFESSIONAL_SCOPE } from "./domain/ports/professional-scope.port"
import { SESSION_REPOSITORY } from "./domain/ports/session.repository"
import { TOKEN_GENERATOR } from "./domain/ports/token-generator"
import { USAGE_STATS_READER } from "./domain/ports/usage-stats.reader"
import { USER_REPOSITORY } from "./domain/ports/user.repository"
import { VERIFICATION_TOKEN_REPOSITORY } from "./domain/ports/verification-token.repository"
import { IDENTITY_CONFIG, loadIdentityConfig } from "./identity.config"
import { Argon2PasswordHasher } from "./infrastructure/hashing/argon2-password-hasher"
import { BoundedPasswordHasher } from "./infrastructure/hashing/bounded-password-hasher"
import { CryptoTokenGenerator } from "./infrastructure/hashing/crypto-token-generator"
import { HmacCsrf } from "./infrastructure/hashing/hmac-csrf"
import { HibpBreachCheck } from "./infrastructure/password/hibp-breach-check"
import { NoopBreachCheck } from "./infrastructure/password/noop-breach-check"
import { ZxcvbnPasswordStrength } from "./infrastructure/password/zxcvbn-password-strength"
import {
  NullProfessionalCommitments,
  NullProfessionalScope,
} from "./infrastructure/professional/null-professional-adapters"
import { DrizzleAuthEventRepository } from "./infrastructure/repositories/drizzle-auth-event.repository"
import { DrizzleDeviceRepository } from "./infrastructure/repositories/drizzle-device.repository"
import { DrizzlePermissionTemplateRepository } from "./infrastructure/repositories/drizzle-permission-template.repository"
import { DrizzleSessionRepository } from "./infrastructure/repositories/drizzle-session.repository"
import { DrizzleUsageStatsReader } from "./infrastructure/repositories/drizzle-usage-stats.reader"
import { DrizzleUserRepository } from "./infrastructure/repositories/drizzle-user.repository"
import { DrizzleVerificationTokenRepository } from "./infrastructure/repositories/drizzle-verification-token.repository"

import type { ProfessionalCommitments } from "./domain/ports/professional-commitments.port"
import type { ProfessionalScope } from "./domain/ports/professional-scope.port"
import type { IdentityConfig } from "./identity.config"
import type {
  DynamicModule,
  MiddlewareConsumer,
  NestModule,
  Provider,
  Type,
} from "@nestjs/common"

// Ports → impls. Os adapters sem dependência (breach/token/strength) não têm
// @Injectable; useClass instancia direto. Argon2 e HMAC-CSRF recebem a config
// do módulo, então vão por useFactory injetando IDENTITY_CONFIG. O Clock é
// global (SharedKernelModule), não é provido aqui.
const PORTS: Provider[] = [
  { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
  {
    provide: PERMISSION_TEMPLATE_REPOSITORY,
    useClass: DrizzlePermissionTemplateRepository,
  },
  { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
  {
    provide: VERIFICATION_TOKEN_REPOSITORY,
    useClass: DrizzleVerificationTokenRepository,
  },
  { provide: AUTH_EVENT_REPOSITORY, useClass: DrizzleAuthEventRepository },
  { provide: USAGE_STATS_READER, useClass: DrizzleUsageStatsReader },
  { provide: DEVICE_REPOSITORY, useClass: DrizzleDeviceRepository },
  {
    provide: PASSWORD_HASHER,
    // Decorado no factory, não no call site: todo consumidor do port — login,
    // set/reset/change-password e o verify dummy — precisa ficar dentro do teto.
    useFactory: (cfg: IdentityConfig) =>
      new BoundedPasswordHasher(
        new Argon2PasswordHasher({
          pepper: cfg.PASSWORD_PEPPER,
          memoryKib: cfg.ARGON_MEMORY_KIB,
          timeCost: cfg.ARGON_TIME_COST,
          parallelism: cfg.ARGON_PARALLELISM,
          hashLength: cfg.ARGON_HASH_LENGTH,
          saltLength: cfg.ARGON_SALT_LENGTH,
        }),
        cfg.PASSWORD_HASH_MAX_IN_FLIGHT
      ),
    inject: [IDENTITY_CONFIG],
  },
  { provide: PASSWORD_STRENGTH, useClass: ZxcvbnPasswordStrength },
  // BREACH_CHECK_ENABLED liga o HIBP real; off (default dev) usa o Noop.
  {
    provide: BREACH_CHECK,
    useFactory: (cfg: IdentityConfig) =>
      cfg.BREACH_CHECK_ENABLED
        ? new HibpBreachCheck(cfg.BREACH_CHECK_MODE)
        : new NoopBreachCheck(),
    inject: [IDENTITY_CONFIG],
  },
  { provide: TOKEN_GENERATOR, useClass: CryptoTokenGenerator },
  // CSRF_SECRET só é exigido em SameSite=none; sob lax o Csrf fica dormente.
  // Sem secret: stub fail-loud (não um HmacCsrf de secret vazio, forjável).
  {
    provide: CSRF,
    useFactory: (cfg: IdentityConfig): Csrf =>
      cfg.CSRF_SECRET
        ? new HmacCsrf(cfg.CSRF_SECRET)
        : {
            sign(): never {
              throw new Error("CSRF indisponível: CSRF_SECRET não configurado.")
            },
            verify(): never {
              throw new Error("CSRF indisponível: CSRF_SECRET não configurado.")
            },
          },
    inject: [IDENTITY_CONFIG],
  },
]

const USE_CASES = [
  LoginUseCase,
  LogoutUseCase,
  GetCurrentUserUseCase,
  ListAccessHistoryUseCase,
  ListDevicesUseCase,
  ListUsersUseCase,
  RevokeDeviceUseCase,
  RevokeOtherDevicesUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  ChangePasswordUseCase,
  VerifyEmailUseCase,
  ResendVerificationUseCase,
  UpdateMyProfileUseCase,
  UploadAvatarUseCase,
  RequestEmailChangeUseCase,
  ValidateEmailChangeQuery,
  ConfirmEmailChangeUseCase,
  CreateUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  RestoreUsersUseCase,
  PurgeUsersUseCase,
  ResendAccessLinkUseCase,
  ValidateAccessLinkQuery,
  SetPasswordUseCase,
  CancelAccessLinkUseCase,
  UploadAccessLinkAvatarUseCase,
  ListPermissionTemplatesUseCase,
  GetPermissionTemplateUseCase,
  CreatePermissionTemplateUseCase,
  UpdatePermissionTemplateUseCase,
  DeletePermissionTemplateUseCase,
]

/**
 * Slot de produto: o identity não conhece scheduling nem service, então quem
 * sabe validar áreas/serviços e ler compromissos entra pela raiz de composição.
 * Ausente (repo base, sem os módulos de agenda) → null objects.
 */
export interface IdentityProfessionalSlot {
  module: Type<unknown>
  scope: Type<ProfessionalScope>
  commitments: Type<ProfessionalCommitments>
}

// SharedKernelModule é @Global — não reimportar Transactional/Context/Outbox/Clock aqui.
@Module({})
export class IdentityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AUTH_MIDDLEWARE_ROUTE)
  }

  static forRoot(
    options: { professional?: IdentityProfessionalSlot } = {}
  ): DynamicModule {
    const { professional } = options
    const slot: Provider[] = professional
      ? [
          { provide: PROFESSIONAL_SCOPE, useExisting: professional.scope },
          {
            provide: PROFESSIONAL_COMMITMENTS,
            useExisting: professional.commitments,
          },
        ]
      : [
          { provide: PROFESSIONAL_SCOPE, useClass: NullProfessionalScope },
          {
            provide: PROFESSIONAL_COMMITMENTS,
            useClass: NullProfessionalCommitments,
          },
        ]

    return {
      module: IdentityModule,
      // Global porque o módulo virou dinâmico: quem importa `IdentityModule`
      // pelo nome da classe receberia outra instância, vazia, e não acharia as
      // facades. Ver design C-PROF.
      global: true,
      // Sem forwardRef: num módulo dinâmico o forwardRef chega cru ao container
      // (addDynamicModules) e gera uma SEGUNDA instância do módulo alvo.
      // RateLimitModule (@Global) provê RATE_LIMITER = composite resiliente;
      // o kernel não registra o guard, a ordem com o CSRF é decidida aqui.
      imports: [
        RateLimitModule,
        ...(professional ? [professional.module] : []),
      ],
      controllers: CONTROLLERS,
      providers: [
        { provide: IDENTITY_CONFIG, useFactory: loadIdentityConfig },
        ...PORTS,
        ...slot,
        ...USE_CASES,
        ProfessionalDirectoryFacade,
        UsageAccessFacade,
        UserDirectoryFacade,
        CreateSessionService,
        RevertExpiredEmailChangesJob,
        PurgeAuthEventsJob,
        AuthMiddleware,
        // Identidade é middleware, não guard: o AccessGuard global do kernel vem
        // do SharedKernelModule (importado antes) e rodaria antes de qualquer
        // guard registrado aqui. Middleware roda antes de todos eles.
        { provide: ACCESS_POLICY, useClass: IdentityAccessPolicy },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
      exports: [
        // O AccessGuard vive no SharedKernelModule: a policy precisa sair daqui
        // (módulo global) para o injector dele enxergar o token.
        ACCESS_POLICY,
        ProfessionalDirectoryFacade,
        UsageAccessFacade,
        UserDirectoryFacade,
      ],
    }
  }
}
