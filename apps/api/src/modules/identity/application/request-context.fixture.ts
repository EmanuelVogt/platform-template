import { IDENTITY_ACCESS, IDENTITY_SESSION } from "./identity-context"

import type { RequestContext } from "../../../shared/kernel/context/request-context"

type FakeStore = {
  userId?: string | null
  sessionId?: string | null
  deviceId?: string | null
  access?: { permissions: ReadonlySet<string>; isMaster: boolean } | null
}

/**
 * RequestContext de spec: deriva o ator e as extensions do identity a partir do
 * mesmo store falso que o `get()` já devolvia, para o spec descrever o cenário
 * em um lugar só.
 */
export function fakeRequestContext(get: () => object): RequestContext {
  const read = (): FakeStore => get()
  return {
    get,
    getActor: () => {
      const { userId } = read()
      return userId == null ? null : { id: userId, kind: "user" }
    },
    getExtension: (key: symbol) => {
      const store = read()
      if (key === IDENTITY_SESSION) {
        return store.sessionId == null
          ? undefined
          : { sessionId: store.sessionId, deviceId: store.deviceId ?? null }
      }
      if (key === IDENTITY_ACCESS) {
        return store.access ?? undefined
      }
      return undefined
    },
  } as unknown as RequestContext
}
