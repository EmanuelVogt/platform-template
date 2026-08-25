import { ulid } from "ulid"

import { PNG_1PX } from "./png-1px"

import type { ObjectStoragePort } from "../../../shared/infra/storage/object-storage.port"
import type { Pool } from "pg"

type SeedAttachmentOptions = {
  ownerUserId: string
  visibility: "public" | "authenticated" | "restricted"
  profile?: string
  originalFilename?: string
  contentType?: string
}

/** Semeia attachment 'ready' + ACL direto no banco (não há rota de upload
 *  pra estado arbitrário) e grava os bytes no storage passado. */
export async function seedAttachment(
  pool: Pool,
  storage: ObjectStoragePort,
  opts: SeedAttachmentOptions
): Promise<string> {
  const id = ulid()
  const storageKey = `e2e/${id}.png`
  const profile = opts.profile ?? "legacy"
  const originalFilename = opts.originalFilename ?? "avatar.png"
  const contentType = opts.contentType ?? "image/png"
  await storage.put(storageKey, PNG_1PX, contentType)
  await pool.query(
    `insert into attachment.attachments
       (id, storage_key, content_type, size_bytes, checksum, original_filename, owner_user_id, status, profile)
     values ($1, $2, $3, $4, 'checksum-e2e', $5, $6, 'ready', $7)`,
    [
      id,
      storageKey,
      contentType,
      PNG_1PX.byteLength,
      originalFilename,
      opts.ownerUserId,
      profile,
    ]
  )
  await pool.query(
    "insert into attachment.attachment_acls (attachment_id, visibility) values ($1, $2)",
    [id, opts.visibility]
  )
  return id
}
