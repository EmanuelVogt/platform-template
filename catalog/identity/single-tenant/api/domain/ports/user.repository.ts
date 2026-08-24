import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { User } from "../entities/user.entity"
import type { PermissionKey } from "../permissions/permission-catalog"

/**
 * Item da listagem admin: a entidade + estado do link de acesso derivado do último
 * token 'access_link'. Para usuário 'active': accessLinkExpiresAt=null, accessLinkExpired=false.
 * Para 'pending' sem token válido: accessLinkExpired=true (libera o resend).
 */
export interface UserListRow {
  user: User
  accessLinkExpiresAt: Date | null
  accessLinkExpired: boolean
  permissions: readonly PermissionKey[]
  /** Áreas/serviços de atuação (perfil Profissional). Vazios para os demais perfis. */
  areaIds: readonly string[]
  serviceIds: readonly string[]
  /** Áreas de agendamento (perfil Agendamentos). Vazias para os demais perfis. */
  schedulingAreaIds: readonly string[]
}

/**
 * Entrada de listagem de usuários — type plano (sem Zod nem api layer), chaves
 * já coagidas. Mora no domain porque é parâmetro do port (domain não depende de
 * application).
 */
export interface ListUsersInput {
  page: number
  pageSize: number
  sort?: "name" | "email" | "createdAt" | "deletedAt"
  order?: "asc" | "desc"
  q?: string
  emailVerified?: boolean
  status?: "pending" | "active"
  /** true = lixeira: lista SÓ soft-deleted (inverte o hard gate de visibilidade). */
  deleted?: boolean
}

export interface SearchAssignableProfessionalsInput {
  q?: string
  page: number
  pageSize: number
}

export interface AssignableProfessionalRow {
  id: string
  name: string
  email: string
  avatarAttachmentId: string | null
}

/** Destinatário de e-mail resolvido por permissão (ou master). */
export interface NotificationTarget {
  id: string
  email: string
  name: string
}

/** Vínculo profissional↔serviço com a marcação de padrão do "Serviços de atuação". */
export interface AssignableProfessionalLink {
  userId: string
  isDefault: boolean
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  /** Como `findById`, mas oculta soft-deleted — leitura de apresentação (hard gate). */
  findVisibleById(id: string): Promise<User | null>
  insert(user: User): Promise<void>
  /** Persiste alterações (lockout, hash, emailVerified). UPDATE pela PK. */
  update(user: User): Promise<void>
  /**
   * Incrementa failed_login_attempts e aplica a trava sob SELECT ... FOR UPDATE
   * na mesma tx — serializa tentativas concorrentes do mesmo user (sem
   * lost-update). A regra de threshold/duração permanece na entidade. Retorna a
   * entidade atualizada (para detectar a transição de lockout) ou null se o
   * user não existir.
   */
  registerFailedAttempt(
    userId: string,
    now: Date,
    threshold: number,
    durationSeconds: number
  ): Promise<User | null>
  /**
   * Como `findById`, mas com SELECT ... FOR UPDATE: trava a linha na tx
   * corrente para reler antes de regravação de linha inteira (update()).
   * Inclui soft-deleted de propósito — quem relê precisa ver a exclusão
   * para recusar, não para ignorá-la.
   */
  findByIdForUpdate(id: string): Promise<User | null>
  /** Listagem paginada/ordenada/filtrada (admin). Ver buildListingClauses. */
  list(input: ListUsersInput): Promise<PaginatedResult<UserListRow>>
  /** User + set de permissões em 1 round-trip (consumo do AuthMiddleware). */
  findByIdWithPermissions(
    id: string
  ): Promise<{ user: User; permissions: readonly PermissionKey[] } | null>
  findPermissions(userId: string): Promise<readonly PermissionKey[]>
  /** Substitui o set inteiro (delete + insert na mesma tx do caller). */
  replacePermissions(
    userId: string,
    permissions: readonly PermissionKey[]
  ): Promise<void>
  /** Substitui as áreas de atuação do Profissional (delete + insert na mesma tx). */
  replaceProfessionalAreas(
    userId: string,
    areaIds: readonly string[]
  ): Promise<void>
  /** Substitui os serviços de atuação do Profissional (delete + insert na mesma tx). */
  replaceProfessionalServices(
    userId: string,
    serviceIds: readonly string[]
  ): Promise<void>
  /** Substitui as áreas de agendamento do perfil Agendamentos (delete + insert na mesma tx). */
  replaceSchedulingAreas(
    userId: string,
    areaIds: readonly string[]
  ): Promise<void>
  /** Áreas/serviços de atuação persistidos do usuário (vazios para não-Profissional). */
  findProfessionalScope(
    userId: string
  ): Promise<{ areaIds: readonly string[]; serviceIds: readonly string[] }>
  findProfessionalAreaIdsByUserIds(
    userIds: string[]
  ): Promise<Map<string, readonly string[]>>
  /** Busca em lote pela PK — inclui soft-deleted (leitura de integridade da lixeira). */
  findByIds(ids: string[]): Promise<User[]>
  /**
   * Usuários com troca de e-mail pendente (`pendingEmail` não-nulo) cujo token
   * 'email_change' já não está ativo (expirado/ausente) em `now` — candidatos a
   * auto-revert pelo maintenance job.
   */
  findStaleEmailChanges(now: Date): Promise<User[]>
  /** Hard delete em lote. FKs com ON DELETE CASCADE levam sessions/devices/tokens. */
  hardDeleteByIds(ids: string[]): Promise<void>
  /** true se o id atende cliente, está vivo e ativo (gate de atribuição
   *  cross-module). O perfil de acesso não entra no critério — ADR 0082. */
  existsActiveProfessional(userId: string): Promise<boolean>
  /** true se o id atende cliente e está vivo, qualquer status — config de horário pelo admin não espera ativação. */
  existsProfessional(userId: string): Promise<boolean>
  /** Busca paginada de quem atende cliente, vivo e ativo; `q` casa nome ou email (seletor de atribuição). */
  searchAssignableProfessionals(
    input: SearchAssignableProfessionalsInput
  ): Promise<PaginatedResult<AssignableProfessionalRow>>
  /** Lookup por id, só quem atende cliente, vivo e ativo — valida atribuição e resolve a view cross-module. */
  findProfessionalsByIds(
    ids: string[]
  ): Promise<Map<string, AssignableProfessionalRow>>
  /** Todos que atendem cliente, vivos e ativos, ordenados por nome (mapa de agenda). */
  listActiveProfessionals(): Promise<AssignableProfessionalRow[]>
  /**
   * Quem atende cliente, vivo e ativo, com a área em "Áreas de atuação",
   * ordenado por nome (filtro do mapa de agenda por área).
   */
  listActiveProfessionalsByArea(
    areaId: string
  ): Promise<AssignableProfessionalRow[]>
  /**
   * Ids de quem atende cliente, vivo e ativo, com o serviço em "Serviços de
   * atuação", agrupados por serviceId (leitura cross-module do motor de agendamento).
   */
  findActiveProfessionalIdsByServices(
    serviceIds: string[]
  ): Promise<Map<string, string[]>>
  /**
   * Como `findActiveProfessionalIdsByServices`, acrescido da flag de padrão do
   * vínculo — o motor de agendamento aloca só os padrões.
   */
  findActiveProfessionalLinksByServices(
    serviceIds: string[]
  ): Promise<Map<string, AssignableProfessionalLink[]>>
  /**
   * Nome de exibição por id, SEM filtro de perfil/status (inclui admin, master,
   * inativo e da lixeira). A trilha de auditoria resolve o ator de qualquer
   * usuário — o filtro de `findProfessionalsByIds` excluiria justamente quem age.
   */
  findNamesByIds(ids: string[]): Promise<Map<string, string>>
  /**
   * Ids de usuários cujo nome casa com `term` (ILIKE), com teto de segurança.
   * Alimenta a busca `q` da trilha de auditoria.
   */
  findIdsByNameLike(term: string): Promise<string[]>
  /**
   * Destinatários ativos e vivos com a chave em `user_permissions` ou
   * `access_profile = 'master'` (mesmo bypass do guard). Sem duplicata.
   */
  findNotificationTargetsByPermission(
    permission: PermissionKey
  ): Promise<NotificationTarget[]>
}

export const USER_REPOSITORY: unique symbol = Symbol("UserRepository")
