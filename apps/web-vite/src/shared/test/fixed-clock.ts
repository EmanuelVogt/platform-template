import { afterAll, beforeAll, vi } from "vitest"

// Quarta-feira ao meio-dia UTC: dia no meio da semana, para que a grade
// domingo→sábado tenha colunas antes e depois de hoje em qualquer fuso.
export const FIXED_NOW = new Date("2026-07-15T12:00:00.000Z")

/**
 * Fixa o relógio em {@link FIXED_NOW} para testes de agenda, cuja grade é
 * derivada da data de hoje.
 *
 * Só `Date` é falsificado: timers reais seguem valendo, senão `userEvent` e o
 * MSW travam esperando um `setTimeout` que nunca avança.
 */
export function setupFixedClock(): void {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(FIXED_NOW)
  })

  afterAll(() => {
    vi.useRealTimers()
  })
}
