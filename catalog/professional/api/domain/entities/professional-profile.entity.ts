import { InvalidBirthDateError } from "../errors"

export interface ProfessionalProfileProps {
  /** Mesmo id do usuário em `identity.users` — a relação é 1:1. */
  readonly userId: string
  // Atende cliente: entra nos seletores, nos mapas e na escala. NÃO deriva do
  // access_profile — agendista e recepção também atendem (ADR 0082).
  readonly servesClients: boolean
  /** ISO 'YYYY-MM-DD' ou null enquanto a pessoa não informou. */
  readonly birthDate: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateProfessionalProfileInput {
  userId: string
  servesClients?: boolean
}

/**
 * Agregado do recorte profissional. `servesClients` e `birthDate` saíram da
 * entidade `User` no corte do agregado (AD-035) e passam a viver aqui, junto
 * com a validação de nascimento que era privada do `User`.
 *
 * Todo método devolve uma instância nova: as props são congeladas.
 */
export class ProfessionalProfile {
  readonly props: ProfessionalProfileProps

  private constructor(props: ProfessionalProfileProps) {
    this.props = Object.freeze(props)
  }

  static fromProps(props: ProfessionalProfileProps): ProfessionalProfile {
    return new ProfessionalProfile(props)
  }

  /** Perfil recém-criado: não atende cliente por padrão e ainda não tem nascimento. */
  static create(
    { userId, servesClients }: CreateProfessionalProfileInput,
    now: Date
  ): ProfessionalProfile {
    return new ProfessionalProfile({
      userId,
      servesClients: servesClients ?? false,
      birthDate: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  /** Sucessor do `servesClients` de `User.updateProfile` (edição pelo admin). */
  updateServesClients(servesClients: boolean, now: Date): ProfessionalProfile {
    return new ProfessionalProfile({
      ...this.props,
      servesClients,
      updatedAt: now,
    })
  }

  /**
   * Sucessor do nascimento de `User.activate` e `User.updateOwnProfile`:
   * valida antes de gravar e recusa a data inválida sem alterar o perfil.
   */
  updateBirthDate(birthDate: string, now: Date): ProfessionalProfile {
    assertValidBirthDate(birthDate, now)
    return new ProfessionalProfile({
      ...this.props,
      birthDate,
      updatedAt: now,
    })
  }
}

const MAX_AGE_YEARS = 120

/** Valida nascimento ISO: data real, não-futura, idade ≤ 120. `birthDate` já vem
 *  com formato 'YYYY-MM-DD' garantido pelo boundary (Zod). */
function assertValidBirthDate(birthDate: string, now: Date): void {
  const [year, month, day] = birthDate.split("-").map(Number)
  const parsed = new Date(`${birthDate}T00:00:00.000Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new InvalidBirthDateError()
  }
  if (parsed.getTime() > now.getTime()) {
    throw new InvalidBirthDateError()
  }
  const maxAgeMs = MAX_AGE_YEARS * 365.25 * 24 * 60 * 60 * 1000
  if (now.getTime() - parsed.getTime() > maxAgeMs) {
    throw new InvalidBirthDateError()
  }
}
