/**
 * Semáforo de concorrência sem fila: ou há vaga agora, ou não há. Quem chama
 * decide a resposta (503 + Retry-After) — enfileirar apenas troca saturação por
 * latência ilimitada, que é o que se quer evitar.
 *
 * `tryAcquire` devolve o release da própria vaga; chamar o release duas vezes é
 * inofensivo (a segunda não decrementa), porque `finally` em caminho já liberado
 * é erro comum e devolveria vagas inexistentes.
 */
export class InFlightGate {
  private acquired = 0

  constructor(private readonly max: number) {}

  /** Vagas ocupadas neste instante. */
  get inFlight(): number {
    return this.acquired
  }

  tryAcquire(): (() => void) | null {
    if (this.acquired >= this.max) {
      return null
    }
    this.acquired += 1
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      this.acquired -= 1
    }
  }
}
