import pino from "pino"

import { RequestContext } from "../../kernel/context/request-context"
import { LoggerFactory } from "../../kernel/logging/logger.factory"

import type { AppLogger } from "../../kernel/logging/logger.factory"

export type LogLine = Record<string, unknown> & {
  level: number
  msg?: string
}

export function fakeLogger(): {
  ctx: RequestContext
  logger: AppLogger
  loggerFactory: LoggerFactory
  lines: LogLine[]
} {
  const lines: LogLine[] = []
  const ctx = new RequestContext()
  const root = pino(
    { level: "trace" },
    {
      write: (chunk: string) => {
        lines.push(JSON.parse(chunk) as LogLine)
      },
    }
  )
  const loggerFactory = new LoggerFactory(ctx, root)
  return { ctx, logger: loggerFactory.forModule("test"), loggerFactory, lines }
}
