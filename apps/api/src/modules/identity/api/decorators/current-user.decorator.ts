import { createParamDecorator, UnauthorizedException } from "@nestjs/common"

import type { ExecutionContext } from "@nestjs/common"
import type { Request } from "express"

/**
 * Injeta o id do usuário autenticado — populado pelo AuthMiddleware no request
 * (`req.userId`). Lança se usado fora de rota autenticada (defesa em profundidade;
 * o guard global já barra o anônimo antes do handler).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const req = context
      .switchToHttp()
      .getRequest<Request & { userId?: string | null }>()
    if (!req.userId) {
      throw new UnauthorizedException("Usuário não autenticado.")
    }
    return req.userId
  },
)
