import { Inject, Injectable } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { ulid } from "ulid"

import { RequestContext } from "../../../shared/kernel/context/request-context"
import { AuthEvent } from "../domain/entities/auth-event.entity"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../domain/ports/auth-event.repository"

import type { RateLimiterDegradedEvent } from "../../../shared/kernel/rate-limit/resilient-rate-limiter"

/**
 * O kernel sinaliza a degradação; a trilha auditável é de quem tem auditoria.
 * Um evento por queda, não por request: quem emite só dispara na transição
 * saudável → degradado, então o listener grava direto, sem deduplicar.
 */
@Injectable()
export class RateLimiterOutageListener {
  constructor(
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    private readonly ctx: RequestContext
  ) {}

  @OnEvent("rate-limiter.degraded")
  async onDegraded(event: RateLimiterDegradedEvent): Promise<void> {
    // A queda pode ser detectada fora de um request (job de manutenção), então
    // o store é opcional e o correlationId cai para um id próprio.
    const store = this.ctx.tryGet()
    await this.authEvents.record(
      AuthEvent.create({
        userId: null,
        actorUserId: null,
        eventType: "rate_limiter_degraded",
        emailHash: null,
        ip: store?.ip ?? null,
        userAgent: store?.userAgent ?? null,
        correlationId: store?.correlationId ?? ulid(),
        traceId: store?.traceId ?? null,
        spanId: store?.spanId ?? null,
        metadata: { since: event.since.toISOString() },
      })
    )
  }
}
