import { Readable } from "node:stream"

import type { ObjectStoragePort } from "../../../shared/infra/storage/object-storage.port"

export type StoredObject = { body: Buffer; contentType: string }

export type InMemoryStorage = ObjectStoragePort & {
  readonly objects: Map<string, StoredObject>
}

/** Storage em memória: substitui o adapter R2 no teste (sem IO externo).
 *  `objects` fica exposto pra spec inspecionar o que foi gravado sem mock. */
export function inMemoryStorage(): InMemoryStorage {
  const objects = new Map<string, StoredObject>()
  return {
    objects,
    put: (key, body, contentType) => {
      objects.set(key, { body, contentType })
      return Promise.resolve()
    },
    getStream: (key) => {
      const o = objects.get(key)
      if (o === undefined) throw new Error(`objeto inexistente: ${key}`)
      return Promise.resolve(Readable.from(o.body))
    },
    head: (key) => {
      const o = objects.get(key)
      return Promise.resolve(
        o === undefined
          ? null
          : {
              contentType: o.contentType,
              sizeBytes: o.body.byteLength,
              etag: "",
            }
      )
    },
    delete: (key) => {
      objects.delete(key)
      return Promise.resolve()
    },
    putStream: async (key, body, contentType) => {
      const chunks: Buffer[] = []
      for await (const chunk of body) chunks.push(chunk as Buffer)
      objects.set(key, { body: Buffer.concat(chunks), contentType })
    },
  }
}
