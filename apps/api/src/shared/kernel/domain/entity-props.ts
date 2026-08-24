/**
 * True quando `next` não difere de `current` em nenhum campo além de `updatedAt`
 * (sempre recarimbado na transição). Deixa o `update()` devolver `this` em vez de
 * uma instância nova, mantendo `updatedAt` honesto e poupando UPDATE full-row à
 * toa. Comparação shallow: `Date` por getTime, o resto por identidade — array ou
 * objeto reconstruído conta como mudança (nunca falso-positivo que descartaria
 * edição real).
 */
export function isUnchanged<T extends { readonly updatedAt: Date }>(
  current: T,
  next: T
): boolean {
  return (Object.keys(current) as (keyof T)[]).every((key) => {
    if (key === "updatedAt") return true
    const a = current[key]
    const b = next[key]
    if (a instanceof Date && b instanceof Date)
      return a.getTime() === b.getTime()
    return a === b
  })
}
