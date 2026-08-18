// Drizzle 0.45 envolve exceções do driver pg em DrizzleQueryError com o erro
// original em `.cause`. Verificamos o código 23505 nos dois níveis.
export function isUniqueViolation(error: unknown): boolean {
  const has23505 = (v: unknown): boolean =>
    typeof v === "object" && v !== null && "code" in v && v.code === "23505"
  return (
    has23505(error) ||
    (typeof error === "object" &&
      error !== null &&
      has23505((error as { cause?: unknown }).cause))
  )
}
