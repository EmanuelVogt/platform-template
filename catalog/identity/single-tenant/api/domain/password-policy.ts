import { WeakPasswordError } from "./errors"

export interface PasswordPolicyParams {
  minZxcvbnScore: number
  // Score vem da infra — esta função é pura e não chama zxcvbn.
  zxcvbnScore: number
}

export function validatePasswordPolicy({
  minZxcvbnScore,
  zxcvbnScore,
}: PasswordPolicyParams): void {
  if (zxcvbnScore < minZxcvbnScore) {
    throw new WeakPasswordError(
      "A senha é muito fraca. Escolha uma mais difícil de adivinhar."
    )
  }
}
