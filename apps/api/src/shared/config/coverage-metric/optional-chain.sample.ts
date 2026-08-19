/** Fixture: optional chaining only — SWC must not invent extra branches. */
export function readBar(
  value: { bar?: string } | null | undefined,
): string | undefined {
  return value?.bar
}
