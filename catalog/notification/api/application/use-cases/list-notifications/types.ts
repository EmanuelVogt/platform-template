import type { PaginatedResult } from "../../../../../shared/kernel/listing/paginated"
import type {
  listNotificationsQuerySchema,
  NotificationItem,
} from "../../../api/contracts/notification.contract"
import type { z } from "zod"

export type ListNotificationsInput = z.infer<
  typeof listNotificationsQuerySchema
>
export type ListNotificationsOutput = PaginatedResult<NotificationItem>
