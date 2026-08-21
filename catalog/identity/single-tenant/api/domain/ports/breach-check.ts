export interface BreachCheck {
  /**
   * true se a senha aparece em vazamentos conhecidos (HIBP k-anonymity).
   * Respeita BREACH_CHECK_MODE: fail_open (erro → false) / fail_closed (erro → throw).
   */
  isBreached(password: string): Promise<boolean>;
}

export const BREACH_CHECK: unique symbol = Symbol('BreachCheck');
