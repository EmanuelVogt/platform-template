import { Global, Module } from "@nestjs/common"

import { CLOCK } from "./clock"
import { SystemClock } from "./system-clock"

/** Expõe o `Clock` como primitivo global do kernel — testável em qualquer módulo. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
