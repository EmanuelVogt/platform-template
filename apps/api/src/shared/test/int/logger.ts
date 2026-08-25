import { fakeLogger } from "../unit/logger"

import type { RequestContext } from "../../kernel/context/request-context"
import type { LoggerFactory } from "../../kernel/logging/logger.factory"

/** LoggerFactory real, porém silencioso, para instanciar classes do kernel em testes. */
export function makeTestLogger(): {
  ctx: RequestContext
  loggerFactory: LoggerFactory
} {
  const { ctx, loggerFactory } = fakeLogger()
  return { ctx, loggerFactory }
}
