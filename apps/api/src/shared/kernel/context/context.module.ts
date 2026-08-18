import { Global, Module } from "@nestjs/common"

import { RequestContext } from "./request-context"

@Global()
@Module({
  providers: [RequestContext],
  exports: [RequestContext],
})
export class ContextModule {}
