import type { CurrentUserResponseDto } from "@platform/api-client/models/CurrentUserResponseDto"

/** Usuário corrente (payload de `GET /auth/session` e da resposta de login). */
export type CurrentUser = CurrentUserResponseDto["user"]
