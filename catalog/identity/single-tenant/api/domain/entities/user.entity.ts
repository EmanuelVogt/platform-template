import { ulid } from "ulid"

import { InvalidAccountStateError } from "../errors"

import type { AccessProfile } from "../access/permission.types"

export type UserStatus = "pending" | "active"

export interface CreateUserInput {
  name: string
  email: string
  accessProfile: AccessProfile
  createdByUserId?: string | null
}

export interface UserProps {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly emailVerified: boolean
  // E-mail novo aguardando confirmação na troca self-service; null = sem troca pendente.
  // Enquanto não-null, `email` segue o antigo e `status` está 'pending'.
  readonly pendingEmail: string | null
  // Classificação fixa (não concede acesso — o guard checa user_permissions). Detalhe no ADR 0028.
  readonly accessProfile: AccessProfile
  readonly passwordHash: string | null
  readonly pepperVersion: number
  readonly status: UserStatus
  readonly failedLoginAttempts: number
  readonly lockedUntil: Date | null
  readonly lastResetRequestedAt: Date | null
  readonly lastVerificationRequestedAt: Date | null
  // Cooldown do pedido de troca de e-mail (rate-limit por usuário).
  readonly lastEmailChangeRequestedAt: Date | null
  readonly avatarAttachmentId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  // Soft delete: instante da exclusão lógica; null = ativo.
  readonly deletedAt: Date | null
  // userId do admin que criou a conta; null = seed/master.
  readonly createdByUserId: string | null
}

export interface CreateActiveUserInput {
  name: string
  email: string
  passwordHash: string
  pepperVersion: number
}

export class User {
  readonly props: UserProps

  private constructor(props: UserProps) {
    this.props = Object.freeze(props)
  }

  static fromProps(props: UserProps): User {
    return new User(props)
  }

  static createActive({
    name,
    email,
    passwordHash,
    pepperVersion,
  }: CreateActiveUserInput): User {
    const now = new Date()
    return new User({
      id: ulid(),
      name,
      email: email.toLowerCase(),
      emailVerified: false,
      pendingEmail: null,
      accessProfile: "admin",
      passwordHash,
      pepperVersion,
      status: "active",
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastResetRequestedAt: null,
      lastVerificationRequestedAt: null,
      lastEmailChangeRequestedAt: null,
      avatarAttachmentId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdByUserId: null,
    })
  }

  static create({
    name,
    email,
    accessProfile,
    createdByUserId,
  }: CreateUserInput): User {
    const now = new Date()
    return new User({
      id: ulid(),
      name,
      email: email.toLowerCase(),
      emailVerified: false,
      pendingEmail: null,
      accessProfile,
      passwordHash: null,
      pepperVersion: 1,
      status: "pending",
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastResetRequestedAt: null,
      lastVerificationRequestedAt: null,
      lastEmailChangeRequestedAt: null,
      avatarAttachmentId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdByUserId: createdByUserId ?? null,
    })
  }

  /**
   * Ativa a conta a partir do estado pending: grava senha e nome, marca
   * emailVerified e vira active. `now` na assinatura (a entidade não chama
   * new Date()). `avatarAttachmentId` já vem resolvido (ownership checada no use case).
   */
  activate(
    input: {
      passwordHash: string
      name: string
      avatarAttachmentId: string | null
    },
    now: Date
  ): User {
    if (this.props.status !== "pending") {
      throw new InvalidAccountStateError()
    }
    return new User({
      ...this.props,
      passwordHash: input.passwordHash,
      name: input.name.trim(),
      avatarAttachmentId: input.avatarAttachmentId,
      status: "active",
      emailVerified: true,
      updatedAt: now,
    })
  }

  /** true se a conta está bloqueada no instante `now` (borda `==` não conta). */
  isLocked(now: Date): boolean {
    return (
      this.props.lockedUntil !== null &&
      this.props.lockedUntil.getTime() > now.getTime()
    )
  }

  /** Ao atingir `threshold`, trava a conta até `now + durationSeconds`. */
  registerFailedAttempt(
    now: Date,
    threshold: number,
    durationSeconds: number
  ): User {
    const failedLoginAttempts = this.props.failedLoginAttempts + 1
    const lockedUntil =
      failedLoginAttempts >= threshold
        ? new Date(now.getTime() + durationSeconds * 1000)
        : this.props.lockedUntil
    return new User({ ...this.props, failedLoginAttempts, lockedUntil })
  }

  clearLockout(): User {
    return new User({
      ...this.props,
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
  }

  rehashPassword(passwordHash: string): User {
    return new User({ ...this.props, passwordHash })
  }

  verifyEmail(): User {
    return new User({ ...this.props, emailVerified: true })
  }

  markResetRequested(now: Date): User {
    return new User({ ...this.props, lastResetRequestedAt: now })
  }

  markVerificationRequested(now: Date): User {
    return new User({ ...this.props, lastVerificationRequestedAt: now })
  }

  /** Soft delete: marca a conta como excluída (exclusão lógica). Retorna nova instância. */
  delete(now: Date): User {
    return new User({ ...this.props, deletedAt: now, updatedAt: now })
  }

  /** true se a conta foi excluída (soft delete). */
  isDeleted(): boolean {
    return this.props.deletedAt !== null
  }

  /** Desfaz o soft delete: exige conta excluída, senão lança. Retorna nova instância viva. */
  restore(): User {
    if (!this.isDeleted()) {
      throw new InvalidAccountStateError()
    }
    return new User({ ...this.props, deletedAt: null })
  }

  /** Edição pelo admin: não toca e-mail, senha nem status da conta. */
  updateProfile(
    input: {
      name: string
      accessProfile: AccessProfile
    },
    now: Date
  ): User {
    return new User({
      ...this.props,
      name: input.name.trim(),
      accessProfile: input.accessProfile,
      updatedAt: now,
    })
  }

  /**
   * Edição self-service do próprio perfil: nome. Não toca em accessProfile/
   * permissões (governança de admin) nem em e-mail (cadeia própria).
   */
  updateOwnProfile(input: { name: string }, now: Date): User {
    return new User({
      ...this.props,
      name: input.name.trim(),
      updatedAt: now,
    })
  }

  /** Troca o avatar (id já resolvido/ownership checada no use case). Nova instância. */
  setAvatar(attachmentId: string, now: Date): User {
    return new User({
      ...this.props,
      avatarAttachmentId: attachmentId,
      updatedAt: now,
    })
  }

  /**
   * Carimba a TENTATIVA de troca de e-mail sem mudar mais nada: a recusa por
   * endereço já em uso paga o mesmo cooldown do pedido aceito, senão sondar
   * endereços sai de graça.
   */
  recordEmailChangeAttempt(now: Date): User {
    return new User({
      ...this.props,
      lastEmailChangeRequestedAt: now,
      updatedAt: now,
    })
  }

  /**
   * Inicia a troca de e-mail: desativa a conta (status 'pending', emailVerified
   * false) e guarda `pendingEmail` SEM destruir o `email` atual. O usuário é
   * deslogado e só reativa confirmando o link enviado ao novo endereço. Exige
   * conta 'active' — segunda solicitação durante uma troca em curso é barrada.
   */
  requestEmailChange(newEmail: string, now: Date): User {
    if (this.props.status !== "active") {
      throw new InvalidAccountStateError()
    }
    return new User({
      ...this.props,
      status: "pending",
      emailVerified: false,
      pendingEmail: newEmail.toLowerCase(),
      lastEmailChangeRequestedAt: now,
      updatedAt: now,
    })
  }

  /**
   * Confirma a troca: promove `pendingEmail` a `email`, reativa a conta e marca
   * o novo e-mail como verificado. Exige troca pendente.
   */
  confirmEmailChange(now: Date): User {
    if (this.props.pendingEmail === null) {
      throw new InvalidAccountStateError()
    }
    return new User({
      ...this.props,
      email: this.props.pendingEmail,
      pendingEmail: null,
      status: "active",
      emailVerified: true,
      updatedAt: now,
    })
  }

  /**
   * Cancela uma troca pendente (auto-revert por expiração do token): reativa a
   * conta com o e-mail antigo e descarta o `pendingEmail`. Exige troca pendente.
   */
  cancelEmailChange(now: Date): User {
    if (this.props.pendingEmail === null) {
      throw new InvalidAccountStateError()
    }
    return new User({
      ...this.props,
      status: "active",
      pendingEmail: null,
      updatedAt: now,
    })
  }

  /** true se há troca de e-mail pendente de confirmação. */
  hasPendingEmailChange(): boolean {
    return this.props.pendingEmail !== null
  }

  isMaster(): boolean {
    return this.props.accessProfile === "master"
  }
}
