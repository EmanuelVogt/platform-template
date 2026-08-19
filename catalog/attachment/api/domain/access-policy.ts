export type Visibility = "public" | "authenticated" | "restricted"

/** Política de acesso 1:1 do attachment. Avaliada só com o userId do request. */
export class AccessPolicy {
  constructor(readonly visibility: Visibility) {}

  /** `ownerUserId` é o dono do attachment; `principalUserId` é quem pede. */
  canBeReadBy(
    principalUserId: string | null,
    ownerUserId: string | null
  ): boolean {
    switch (this.visibility) {
      case "public":
        return true
      case "authenticated":
        return principalUserId !== null
      case "restricted":
        return principalUserId !== null && principalUserId === ownerUserId
    }
  }
}
