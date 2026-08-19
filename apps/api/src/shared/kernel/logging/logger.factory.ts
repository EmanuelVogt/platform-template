import { Inject, Injectable } from "@nestjs/common"
import pino, { type Logger } from "pino"

import { env } from "../../config/env"
import { RequestContext } from "../context/request-context"

import { redactConfig } from "./log.redact"
import { logSerializers } from "./log.serializers"

export const PINO = Symbol("PINO")

export type LogBindings = Record<string, unknown>

export function createRootLogger(): Logger {
  const config = env()
  const isProd = config.NODE_ENV === "production"
  const usePretty = !isProd && config.NODE_ENV !== "test"
  return pino({
    level: config.LOG_LEVEL ?? (isProd ? "info" : "debug"),
    redact: redactConfig,
    serializers: logSerializers,
    base: { service: config.OTEL_SERVICE_NAME },
    ...(usePretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "SYS:standard", singleLine: false },
          },
        }
      : {}),
  })
}

/**
 * Wrapper de escopo: injeta os campos de correlação do RequestContext em toda
 * linha. `err` sempre como objeto (`{ err }`) — pino preserva o stack.
 */
export class AppLogger {
  constructor(
    private readonly logger: Logger,
    private readonly ctx: RequestContext
  ) {}

  private withContext(extra: LogBindings): LogBindings {
    const c = this.ctx.tryGet()
    // traceId/spanId NÃO vão aqui: o instrumentation-pino injeta trace_id/span_id
    // nativos (corretos no instante da emissão); o par camelCase do store era
    // redundante e o spanId ficava congelado no momento do middleware.
    return {
      requestId: c?.requestId,
      correlationId: c?.correlationId,
      causationId: c?.causationId,
      tenantId: c?.tenantId,
      userId: c?.actor?.id ?? null,
      // SPEC_DEVIATION: sessionId removido do log.
      // Reason: o campo não existe mais no store após a remoção da
      // superfície transicional (T9a); o kernel não pode importar a
      // extension de sessão do módulo identity para recompô-lo.
      ...extra,
    }
  }

  info(msg: string, bindings: LogBindings = {}): void {
    this.logger.info(this.withContext(bindings), msg)
  }

  warn(msg: string, bindings: LogBindings = {}): void {
    this.logger.warn(this.withContext(bindings), msg)
  }

  error(msg: string, bindings: LogBindings = {}): void {
    this.logger.error(this.withContext(bindings), msg)
  }

  debug(msg: string, bindings: LogBindings = {}): void {
    this.logger.debug(this.withContext(bindings), msg)
  }
}

@Injectable()
export class LoggerFactory {
  constructor(
    private readonly ctx: RequestContext,
    @Inject(PINO) private readonly root: Logger
  ) {}

  forModule(scope: string): AppLogger {
    return new AppLogger(this.root.child({ scope }), this.ctx)
  }
}
