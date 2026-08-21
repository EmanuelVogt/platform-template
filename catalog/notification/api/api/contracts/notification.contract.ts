import { createZodDto } from "nestjs-zod"
import { z } from "zod"

import { baseListingQuerySchema } from "../../../../shared/kernel/listing/listing-query.schema"
import { makePaginatedSchema } from "../../../../shared/kernel/listing/paginated"

const notificationActionSchema = z.object({
  label: z.string(),
  // Path relativo apenas — a central de notificações não vira open-redirect.
  deepLink: z.string().regex(/^\//, "deepLink deve ser path relativo"),
})

const isoDate = z.iso.datetime()

const notificationBase = {
  id: z.string(),
  title: z.string(),
  body: z.string(),
  actions: z.array(notificationActionSchema),
  locale: z.string(),
  seenAt: isoDate.nullable(),
  readAt: isoDate.nullable(),
  archivedAt: isoDate.nullable(),
  createdAt: isoDate,
}

// Só tipos com canal system entram no feed — email-only nunca grava linha.
export const notificationItemSchema = z.discriminatedUnion("type", [
  z.object({
    ...notificationBase,
    type: z.literal("password_changed"),
    metadata: z.object({ at: isoDate }),
  }),
  z.object({
    ...notificationBase,
    type: z.literal("device_new_login"),
    metadata: z.object({
      deviceLabel: z.string(),
      ip: z.string().nullable(),
      at: isoDate,
    }),
  }),
  z.object({
    ...notificationBase,
    type: z.literal("device_revoked"),
    metadata: z.object({ deviceId: z.string() }),
  }),
  z.object({
    ...notificationBase,
    type: z.literal("password_set"),
    metadata: z.object({ userName: z.string() }),
  }),
])
export type NotificationItem = z.infer<typeof notificationItemSchema>

export const listNotificationsQuerySchema = baseListingQuerySchema
  .pick({ page: true, pageSize: true })
  .extend({
    filter: z.enum(["unread", "read", "archived", "all"]).optional(),
  })
export class ListNotificationsQueryDto extends createZodDto(
  listNotificationsQuerySchema
) {}

export const listNotificationsResponseSchema = makePaginatedSchema(
  notificationItemSchema
)
export class ListNotificationsResponseDto extends createZodDto(
  listNotificationsResponseSchema
) {}

export const unseenCountResponseSchema = z.object({ count: z.number().int() })
export class UnseenCountResponseDto extends createZodDto(
  unseenCountResponseSchema
) {}

export const notificationIdParamsSchema = z.object({ id: z.string().min(1) })
export class NotificationIdParamsDto extends createZodDto(
  notificationIdParamsSchema
) {}
