/**
 * "skipped" existe para separar "não vazada" de "não deu para saber": tratar a
 * queda do provedor como `clear` esconde a lacuna, e tratá-la como `breached`
 * puniria o usuário por uma falha que não é dele.
 */
export type BreachVerdict = 'clear' | 'breached' | 'skipped';

export interface BreachCheck {
  /**
   * Consulta HIBP por k-anonymity. Falha de rede sob `fail_open` devolve
   * "skipped"; sob `fail_closed` lança `BreachCheckUnavailableError`.
   */
  check(password: string): Promise<BreachVerdict>;
}

export const BREACH_CHECK: unique symbol = Symbol('BreachCheck');
