import { createZodDto } from "nestjs-zod"
import { z } from "zod"

import {
  baseListingQuerySchema,
  zBoolQuery,
} from "../../../../shared/kernel/listing/listing-query.schema"
import { makePaginatedSchema } from "../../../../shared/kernel/listing/paginated"
import { ACCESS_HISTORY_EVENT_TYPES } from "../../application/use-cases/list-access-history/types"
import {
  ACCESS_PROFILES,
  ASSIGNABLE_ACCESS_PROFILES,
} from "../../domain/access/permission.types"
import { PERMISSION_KEYS } from "../../domain/permissions/permission-catalog"

// Limites de tamanho em TODA entrada de texto: 254 é o máximo de um endereço
// de e-mail (RFC 5321), 128 cobre qualquer token emitido aqui e 200 o nome.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido.").max(254))
const token = z.string().min(1, "Token obrigatório.").max(128)
const name = z.string().trim().min(1, "Informe o nome.").max(200)

/** Lista de ids não repete item: duplicata é entrada malformada, não intenção. */
const noDuplicates = (values: readonly string[]): boolean =>
  new Set(values).size === values.length
const NO_DUPLICATES = "Não repita itens na lista."

/** `:id` de rota: presente e curto — ULID/UUID cabem em 64 caracteres. */
export const idParamSchema = z.object({ id: z.string().min(1).max(64) })
export class IdParamDto extends createZodDto(idParamSchema) {}

export const permissionKeySchema = z.enum(PERMISSION_KEYS)
// Enum atribuível EXCLUI 'master' — master existe só via seed (spec, regra 6).
export const assignableAccessProfileSchema = z.enum(ASSIGNABLE_ACCESS_PROFILES)
export const accessProfileSchema = z.enum(ACCESS_PROFILES)
export const permissionSetSchema = z
  .array(permissionKeySchema)
  .max(PERMISSION_KEYS.length)
  .refine(noDuplicates, NO_DUPLICATES)

// Áreas/serviços de atuação e áreas de agendamento. Schemas PLANOS de
// propósito (sem superRefine): ZodEffects quebraria a introspecção
// OpenAPI→Kubb — o `.refine` de duplicata é um check simples do Zod 4, que
// preserva o shape de array na introspecção. A regra cross-field (quem atende exige ≥1 área de atuação;
// quem não atende ignora os arrays) é validada no server (use-case) e
// espelhada no front. Ver ADR 0032 e 0082.
export const areaIdsSchema = z
  .array(z.string().min(1))
  .max(100)
  .refine(noDuplicates, NO_DUPLICATES)
export const serviceIdsSchema = z
  .array(z.string().min(1))
  .max(2000)
  .refine(noDuplicates, NO_DUPLICATES)

// password no contrato só valida presença/limites grosseiros; força real
// (zxcvbn + breach) é checada no use-case (spec §7 — não é teatro de cliente).
const password = z.string().min(1, "Senha obrigatória.").max(256)

export const loginSchema = z.object({
  email,
  password,
  rememberMe: z.boolean().default(true),
})

export const forgotPasswordSchema = z.object({
  email,
})

export const resetPasswordSchema = z.object({
  token,
  password,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual obrigatória.").max(256),
  newPassword: password,
})

export const verifyEmailSchema = z.object({
  token,
})

export const userResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  // Novo e-mail aguardando confirmação (troca em curso); null = sem troca pendente.
  pendingEmail: z.string().nullable(),
  accessProfile: accessProfileSchema,
  permissions: permissionSetSchema,
  avatarAttachmentId: z.string().nullable(),
  // ISO 'YYYY-MM-DD'; null para master/seed que não passam pela ativação.
  birthDate: z.string().nullable(),
})

// envelope de resposta dos controllers (spec §13): login/session → { user }.
// O cliente Kubb tipa as respostas a partir deste.
export const currentUserResponseSchema = z.object({ user: userResponseSchema })

export class LoginDto extends createZodDto(loginSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
export class CurrentUserResponseDto extends createZodDto(
  currentUserResponseSchema
) {}

export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>

// Admin — listagem de usuários (GET /v1/admin/users): query base (page/pageSize/
// q/order) + allowlist de sort + filtros tipados; resposta = envelope paginado.
export const listUsersQuerySchema = baseListingQuerySchema.extend({
  sort: z.enum(["name", "email", "createdAt", "deletedAt"]).optional(),
  emailVerified: zBoolQuery.optional(),
  status: z.enum(["pending", "active"]).optional(),
  deleted: zBoolQuery.optional(),
})
export class ListUsersQueryDto extends createZodDto(listUsersQuerySchema) {}
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>

export const userListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  accessProfile: accessProfileSchema,
  servesClients: z.boolean(),
  permissions: permissionSetSchema,
  // Áreas/serviços de atuação (quem atende cliente). Vazios para os demais.
  areaIds: z.array(z.string()),
  serviceIds: z.array(z.string()),
  // Áreas de agendamento (perfil Agendamentos). Vazias para os demais.
  schedulingAreaIds: z.array(z.string()),
  avatarAttachmentId: z.string().nullable(),
  createdAt: z.string(),
  status: z.enum(["pending", "active"]),
  accessLinkExpiresAt: z.string().nullable(),
  accessLinkExpired: z.boolean(),
  deletedAt: z.string().nullable(),
})
export const listUsersResponseSchema = makePaginatedSchema(userListItemSchema)
export class ListUsersResponseDto extends createZodDto(
  listUsersResponseSchema
) {}

// Lixeira — restore/purge em lote (POST /v1/admin/users/restore|purge).
export const trashUserIdsSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "Informe ao menos um usuário.").max(100),
})
export class TrashUserIdsDto extends createZodDto(trashUserIdsSchema) {}

export const restoreUsersResponseSchema = z.object({ restored: z.number().int() })
export class RestoreUsersResponseDto extends createZodDto(restoreUsersResponseSchema) {}

export const purgeUsersResponseSchema = z.object({ purged: z.number().int() })
export class PurgeUsersResponseDto extends createZodDto(purgeUsersResponseSchema) {}

// --- link de acesso ---
export const createUserSchema = z.object({
  name,
  email,
  accessProfile: assignableAccessProfileSchema,
  // Atende cliente: independe do perfil de acesso (ADR 0082).
  servesClients: z.boolean().default(false),
  permissions: permissionSetSchema,
  // Quem atende cliente. Omitidos/[] para os demais (o server os ignora).
  areaIds: areaIdsSchema.default([]),
  serviceIds: serviceIdsSchema.default([]),
  // Perfil Agendamentos. Omitido/[] nos demais perfis (o server o ignora).
  schedulingAreaIds: areaIdsSchema.default([]),
})
export class CreateUserDto extends createZodDto(createUserSchema) {}
export type CreateUserInput = z.infer<typeof createUserSchema>

// updateUser NÃO aceita e-mail: mudança de e-mail tem cadeia própria
// (re-verificação/access-link) — fora do escopo do authz (spec).
export const updateUserSchema = z.object({
  name,
  accessProfile: assignableAccessProfileSchema,
  // Atende cliente: independe do perfil de acesso (ADR 0082).
  servesClients: z.boolean().default(false),
  permissions: permissionSetSchema,
  // Quem atende cliente. Omitidos/[] para os demais (o server os ignora).
  areaIds: areaIdsSchema.default([]),
  serviceIds: serviceIdsSchema.default([]),
  // Perfil Agendamentos. Omitido/[] nos demais perfis (o server o ignora).
  schedulingAreaIds: areaIdsSchema.default([]),
})
export const updateUserParamsSchema = idParamSchema
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
export class UpdateUserParamsDto extends createZodDto(updateUserParamsSchema) {}
export type UpdateUserBody = z.infer<typeof updateUserSchema>

export const setPasswordSchema = z.object({
  token,
  password,
  name,
  // ISO 'YYYY-MM-DD'. Validação de data real fica no domínio (activate).
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  avatarAttachmentId: z.string().optional(),
})
export class SetPasswordDto extends createZodDto(setPasswordSchema) {}
export type SetPasswordInput = z.infer<typeof setPasswordSchema>

// --- conta self-service (perfil, avatar, troca de e-mail) ---
export const updateMyProfileSchema = z.object({
  name,
  // ISO 'YYYY-MM-DD'. Opcional: quem não tem nascimento (master/seed) salva só o
  // nome. Validação de data real fica no domínio (updateOwnProfile).
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").optional(),
})
export class UpdateMyProfileDto extends createZodDto(updateMyProfileSchema) {}
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>

export const avatarUploadResponseSchema = z.object({
  avatarAttachmentId: z.string(),
})
export class AvatarUploadResponseDto extends createZodDto(avatarUploadResponseSchema) {}

export const accessLinkAvatarUploadResponseSchema = z.object({
  attachmentId: z.string(),
})
export class AccessLinkAvatarUploadResponseDto extends createZodDto(
  accessLinkAvatarUploadResponseSchema
) {}

export const changeEmailSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual obrigatória.").max(256),
  newEmail: email,
})
export class ChangeEmailDto extends createZodDto(changeEmailSchema) {}
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>

export const validateEmailChangeQuerySchema = z.object({
  token,
})
export class ValidateEmailChangeQueryDto extends createZodDto(validateEmailChangeQuerySchema) {}

export const emailChangeInfoSchema = z.object({ newEmail: z.string() })
export class EmailChangeInfoDto extends createZodDto(emailChangeInfoSchema) {}

export const confirmEmailChangeSchema = z.object({
  token,
})
export class ConfirmEmailChangeDto extends createZodDto(confirmEmailChangeSchema) {}
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>

// Histórico de acesso
export const accessHistoryQuerySchema = baseListingQuerySchema.pick({
  page: true,
  pageSize: true,
  order: true,
})
export class AccessHistoryQueryDto extends createZodDto(accessHistoryQuerySchema) {}

export const accessHistoryItemSchema = z.object({
  id: z.string(),
  eventType: z.enum(ACCESS_HISTORY_EVENT_TYPES),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
})
export const accessHistoryListResponseSchema = makePaginatedSchema(accessHistoryItemSchema)
export class AccessHistoryListResponseDto extends createZodDto(accessHistoryListResponseSchema) {}

export const validateAccessLinkQuerySchema = z.object({
  token,
})
export class ValidateAccessLinkQueryDto extends createZodDto(validateAccessLinkQuerySchema) {}

export const accessLinkInfoSchema = z.object({
  name: z.string(),
  email: z.string(),
  avatarAttachmentId: z.string().nullable(),
})
export class AccessLinkInfoDto extends createZodDto(accessLinkInfoSchema) {}

export const cancelAccessLinkSchema = z.object({
  token,
})
export class CancelAccessLinkDto extends createZodDto(cancelAccessLinkSchema) {}

// --- Dispositivos ---
export const deviceResponseSchema = z.object({
  id: z.string(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  activeSessionCount: z.number().int(),
  current: z.boolean(),
})
export const deviceListResponseSchema = z.object({
  devices: z.array(deviceResponseSchema),
})
export class DeviceListResponseDto extends createZodDto(deviceListResponseSchema) {}
