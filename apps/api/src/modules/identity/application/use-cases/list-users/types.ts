import type { PaginatedResult } from "../../../../../shared/kernel/listing/paginated"
import type { UserListItemView } from "../../views"

// ListUsersInput mora no domain (user.repository.ts) — é parâmetro do port, e
// domain não depende de application. Aqui só o output, que carrega a view.
export type ListUsersOutput = PaginatedResult<UserListItemView>
