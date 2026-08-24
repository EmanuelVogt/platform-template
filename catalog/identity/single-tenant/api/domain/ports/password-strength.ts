export interface PasswordStrength {
  /** Score zxcvbn de 0 (fraca) a 4 (forte). */
  score(password: string): number
}

export const PASSWORD_STRENGTH: unique symbol = Symbol("PasswordStrength")
