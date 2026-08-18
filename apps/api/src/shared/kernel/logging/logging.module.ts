import { Global, Module } from "@nestjs/common"

import { createRootLogger, LoggerFactory, PINO } from "./logger.factory"

@Global()
@Module({
  providers: [{ provide: PINO, useFactory: createRootLogger }, LoggerFactory],
  exports: [LoggerFactory],
})
export class LoggingModule {}
