import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core"
import { adjacencyGraphs, dictionary } from "@zxcvbn-ts/language-common"

import type { PasswordStrength } from "../../domain/ports/password-strength"

zxcvbnOptions.setOptions({
  dictionary: { ...dictionary },
  graphs: adjacencyGraphs,
})

/** Força server-side (spec §7): score zxcvbn 0-4. Não é teatro de UX. */
export class ZxcvbnPasswordStrength implements PasswordStrength {
  score(password: string): number {
    return zxcvbn(password).score
  }
}
