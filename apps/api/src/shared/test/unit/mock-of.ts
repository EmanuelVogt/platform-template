import { vi } from "vitest"

import type { Mocked } from "vitest"

// Sondas que runtime e matchers leem em qualquer objeto: devolver um stub aqui
// faria `await mock` pendurar e `expect(mock)` enxergar um matcher assimétrico.
const PROBES = new Set(["then", "$$typeof", "asymmetricMatch", "nodeType"])

/**
 * Dublê tipado de uma porta: o que não foi fornecido vira um `vi.fn()` que
 * rejeita nomeando o método, de modo que uma dependência chamada sem ter sido
 * declarada falha o teste em vez de devolver `undefined`.
 */
export function mockOf<T extends object>(
  partial: Partial<Mocked<T>> = {}
): Mocked<T> {
  const stubs = new Map<string, unknown>(Object.entries(partial))
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === "symbol" || PROBES.has(property))
          return undefined
        if (!stubs.has(property)) {
          stubs.set(
            property,
            vi.fn(() => Promise.reject(new Error(`${property} not stubbed`)))
          )
        }
        return stubs.get(property)
      },
      set(_target, property, value) {
        if (typeof property === "symbol") return false
        stubs.set(property, value)
        return true
      },
      has: (_target, property) =>
        typeof property === "string" && !PROBES.has(property),
    }
  ) as Mocked<T>
}
