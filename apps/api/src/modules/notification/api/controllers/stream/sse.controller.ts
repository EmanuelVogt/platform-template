import { Controller, Req, Sse } from "@nestjs/common"
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { requireRecipient } from "../../../application/require-recipient"
import { SseConnectionRegistry } from "../../../infrastructure/realtime/sse-connection-registry"

import type { MessageEvent } from "@nestjs/common"
import type { Request } from "express"
import type { Observable } from "rxjs"

@ApiTags("Notifications")
@Controller("notifications")
export class SseController {
  constructor(
    private readonly registry: SseConnectionRegistry,
    private readonly ctx: RequestContext
  ) {}

  // Fora do OpenAPI: o Kubb geraria hook React Query que tenta parsear
  // text/event-stream como JSON. Front consome com EventSource (withCredentials).
  @ApiExcludeEndpoint()
  @SelfService()
  @Sse("stream")
  stream(@Req() req: Request): Observable<MessageEvent> {
    const recipientId = requireRecipient(this.ctx)
    const conn = this.registry.register(recipientId)
    req.on("close", () => {
      conn.close()
    })
    return conn.stream
  }
}
