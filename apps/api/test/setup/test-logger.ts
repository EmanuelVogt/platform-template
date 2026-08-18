import pino from "pino"

import { RequestContext } from "../../src/shared/kernel/context/request-context"
import { LoggerFactory } from "../../src/shared/kernel/logging/logger.factory"

/** LoggerFactory real, porém silencioso, para instanciar classes do kernel em testes. */
export function makeTestLogger(): {
  ctx: RequestContext
  loggerFactory: LoggerFactory
} {
  const ctx = new RequestContext()
  const loggerFactory = new LoggerFactory(ctx, pino({ level: "silent" }))
  return { ctx, loggerFactory }
}
