import type { BreachCheck } from "../../domain/ports/breach-check"

/** Sempre false. Para dev/MVP onde HIBP não deve ser chamado (spec §19). */
export class NoopBreachCheck implements BreachCheck {
  async isBreached(_password: string): Promise<boolean> {
    return false
  }
}
