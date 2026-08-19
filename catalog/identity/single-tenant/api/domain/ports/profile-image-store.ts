import { ProfileImageStoreMissingError } from '../errors';

export type ProfileImageSlot = 'avatar' | 'access-link-avatar';

export interface ProfileImageUpload {
  bytes: Buffer;
  declaredContentType: string;
  originalFilename: string | null;
  profile: ProfileImageSlot;
  ownerUserId: string;
}

/**
 * Armazenamento das imagens de perfil (avatar do usuário e avatar enviado pelo
 * link de acesso). Porta opcional: sem provider registrado apenas estas três
 * operações falham, e o resto da identidade continua de pé.
 */
export interface ProfileImageStore {
  upload(image: ProfileImageUpload): Promise<{ id: string }>;
  delete(id: string): Promise<void>;
  /** true se a imagem existe, está pronta e pertence ao usuário informado. */
  exists(id: string, ownerUserId: string): Promise<boolean>;
}

export const PROFILE_IMAGE_STORE: unique symbol = Symbol('ProfileImageStore');

export function requireProfileImageStore(
  store: ProfileImageStore | null,
): ProfileImageStore {
  if (store === null) {
    throw new ProfileImageStoreMissingError();
  }
  return store;
}
