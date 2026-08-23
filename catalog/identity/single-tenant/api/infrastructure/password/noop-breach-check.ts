import type {
  BreachCheck,
  BreachVerdict,
} from "../../domain/ports/breach-check"

/** Sempre "clear". Para dev/MVP onde HIBP não deve ser chamado (spec §19). */
export class NoopBreachCheck implements BreachCheck {
  async check(_password: string): Promise<BreachVerdict> {
    return "clear"
  }
}
