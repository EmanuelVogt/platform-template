export type ProfileImageSlot = "avatar" | "access-link-avatar"

export type ProfileImageUpload = {
  bytes: Buffer
  declaredContentType: string
  originalFilename: string | null
  profile: ProfileImageSlot
  ownerUserId: string
}

/**
 * Armazenamento das imagens de perfil, entregue por quem guarda arquivos.
 * Porta opcional entre dois módulos: o token mora no kernel para que consumidor
 * e provedor se encontrem sem uma aresta de import entre eles. Sem provider
 * registrado só as operações de imagem de perfil degradam; o resto do módulo
 * consumidor continua de pé.
 */
export interface ProfileImageStore {
  upload(image: ProfileImageUpload): Promise<{ id: string }>
  delete(id: string): Promise<void>
  /** true se a imagem existe, está pronta e pertence ao usuário informado. */
  exists(id: string, ownerUserId: string): Promise<boolean>
}

export const PROFILE_IMAGE_STORE: unique symbol = Symbol("ProfileImageStore")
