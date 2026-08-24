import { ProfileImageStoreMissingError } from "../errors"

import type { ProfileImageStore } from "../../../../shared/kernel/profile-image/profile-image-store.port"

export function requireProfileImageStore(
  store: ProfileImageStore | null
): ProfileImageStore {
  if (store === null) {
    throw new ProfileImageStoreMissingError()
  }
  return store
}
