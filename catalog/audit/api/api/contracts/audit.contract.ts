import { createZodDto } from "nestjs-zod"
import { z } from "zod"

import { baseListingQuerySchema } from "../../../../shared/kernel/listing/listing-query.schema"
import { makePaginatedSchema } from "../../../../shared/kernel/listing/paginated"

export const auditOpSchema = z.enum(["insert", "update", "delete"])

export const auditOriginFilterSchema = z.enum(["user", "system"])

export const listAuditEntriesQuerySchema = baseListingQuerySchema.extend({
  sort: z.enum(["occurredAt"]).optional(),
  table: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  actorUserId: z.string().trim().min(1).optional(),
  op: auditOpSchema.optional(),
  origin: auditOriginFilterSchema.optional(),
  txId: z.coerce.number().int().max(Number.MAX_SAFE_INTEGER).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
})
export class ListAuditEntriesQueryDto extends createZodDto(
  listAuditEntriesQuerySchema
) {}

/** Valor antes/depois de um campo alterado. jsonb → tipo aberto no contrato.
 *  oldLabel/newLabel: nome resolvido quando o valor é FK conhecida (ver ADR 0047). */
const auditChangeSchema = z.object({
  old: z.unknown(),
  new: z.unknown(),
  oldLabel: z.string().nullable(),
  newLabel: z.string().nullable(),
})

export const auditEntryItemSchema = z.object({
  seq: z.number().int(),
  occurredAt: z.string(),
  schemaName: z.string(),
  tableName: z.string(),
  entityId: z.string(),
  op: auditOpSchema,
  changedKeys: z.array(z.string()),
  changes: z.record(z.string(), auditChangeSchema),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  correlationId: z.string().nullable(),
  origin: z.string(),
  txId: z.number().int(),
})

export const listAuditEntriesResponseSchema =
  makePaginatedSchema(auditEntryItemSchema)
export class ListAuditEntriesResponseDto extends createZodDto(
  listAuditEntriesResponseSchema
) {}
