// Multiconjunto: multiplicidade conta (duas chaves iguais ≠ uma), ordem não.
export function sameUnorderedKeys(
  a: readonly string[],
  b: readonly string[]
): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((key, index) => key === sortedB[index])
}
