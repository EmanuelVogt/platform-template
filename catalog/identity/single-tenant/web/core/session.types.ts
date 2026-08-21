import type { CurrentUserResponseDto } from "@platform/api-client/models/CurrentUserResponseDto"

/** Usuário corrente (payload de `GET /v1/auth/session` e da resposta de login). */
export type CurrentUser = CurrentUserResponseDto["user"]
