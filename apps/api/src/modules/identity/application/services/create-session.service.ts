import { Inject, Injectable } from "@nestjs/common"

import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { Device } from "../../domain/entities/device.entity"
import { Session } from "../../domain/entities/session.entity"
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../domain/ports/device.repository"
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../../domain/ports/session.repository"
import {
  TOKEN_GENERATOR,
  type TokenGenerator,
} from "../../domain/ports/token-generator"
import { IDENTITY_CONFIG, type IdentityConfig } from "../../identity.config"

import type { User } from "../../domain/entities/user.entity"

export interface CreateSessionInput {
  deviceCookie?: string | null
  rememberMe: boolean
}

export interface SessionResult {
  /** Token raw da sessão (vai no cookie httpOnly; no DB só o hash). */
  sessionToken: string
  /** PK da sessão — o controller assina o cookie CSRF a partir dela. */
  sessionId: string
  /** Token de device a (re)setar no cookie (sliding). */
  deviceCookie: string
  /** TTL do cookie de sessão (segundos). */
  maxAge: number
  /** TTL do cookie de device (segundos). */
  deviceCookieMaxAge: number
  /** true quando o device foi criado agora — o caller decide se notifica. */
  isNewDevice: boolean
}

/**
 * Emissão de sessão reutilizável (login e ativação de conta). Resolve o device,
 * cria a Session, aplica o cap por usuário e calcula o TTL por rememberMe.
 * Chamado DENTRO da @Transactional do caller (tx ambiente via ALS). O auth_event
 * fica no caller. Ver ADR 0026.
 */
@Injectable()
export class CreateSessionService {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    private readonly ctx: RequestContext,
  ) {}

  async create(
    user: User,
    input: CreateSessionInput,
    now: Date,
  ): Promise<SessionResult> {
    const ctx = this.ctx.get()
    const { raw, hash } = this.tokens.generate()
    const idleTtl = input.rememberMe
      ? this.config.SESSION_REMEMBER_IDLE_TTL_SECONDS
      : this.config.SESSION_IDLE_TTL_SECONDS
    const absoluteExpiry =
      now.getTime() + this.config.SESSION_ABSOLUTE_TTL_SECONDS * 1000
    const idleExpiry = now.getTime() + idleTtl * 1000
    const device = await this.resolveDevice(user.props.id, input.deviceCookie)
    // Relogin no mesmo browser: o cookie de sessão anterior é sobrescrito, mas o
    // token antigo seguiria autenticando até expirar (replay) — revoga antes.
    if (!device.isNew) {
      await this.sessions.deleteByDevice(device.id)
    }
    const session = Session.create({
      userId: user.props.id,
      tokenHash: hash,
      rememberMe: input.rememberMe,
      // Fonte única: ip/userAgent vêm do ctx (mesma origem da auditoria).
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      deviceId: device.id,
      expiresAt: new Date(Math.min(idleExpiry, absoluteExpiry)),
    })
    await this.sessions.create(session)

    // Cap de sessões por usuário — revoga as mais antigas além do teto (§6).
    // Sob logins concorrentes do mesmo user o teto é eventually-consistent
    // (excesso transiente converge no próximo login) — best-effort intencional.
    const count = await this.sessions.countByUser(user.props.id)
    if (count > this.config.SESSION_MAX_PER_USER) {
      await this.sessions.deleteOldestOverCap(
        user.props.id,
        this.config.SESSION_MAX_PER_USER,
      )
    }

    return {
      sessionToken: raw,
      sessionId: session.props.id,
      deviceCookie: device.cookieOut,
      maxAge: idleTtl,
      deviceCookieMaxAge: this.config.DEVICE_COOKIE_TTL_SECONDS,
      isNewDevice: device.isNew,
    }
  }

  // Cookie NÃO é credencial — só agrupa sessões.
  private async resolveDevice(
    userId: string,
    deviceCookie: string | null | undefined,
  ): Promise<{ id: string; cookieOut: string; isNew: boolean }> {
    if (deviceCookie) {
      const hash = this.tokens.hashOf(deviceCookie)
      const existing = await this.devices.findByUserAndCookieHash(userId, hash)
      if (existing) {
        return { id: existing.props.id, cookieOut: deviceCookie, isNew: false }
      }
      // Cookie de outro user (ou device apagado): cria row nova com o mesmo hash.
      const created = Device.create({ userId, cookieTokenHash: hash })
      await this.devices.create(created)
      return { id: created.props.id, cookieOut: deviceCookie, isNew: true }
    }
    const { raw, hash } = this.tokens.generate()
    const created = Device.create({ userId, cookieTokenHash: hash })
    await this.devices.create(created)
    return { id: created.props.id, cookieOut: raw, isNew: true }
  }
}
