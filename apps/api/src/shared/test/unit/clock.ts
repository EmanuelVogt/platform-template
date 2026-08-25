import { FIXED_NOW } from "./constants"

import type { Clock } from "../../kernel/clock/clock"

export function fixedClock(iso: string = FIXED_NOW): Clock {
  const time = new Date(iso)
  if (Number.isNaN(time.getTime())) {
    throw new Error(`fixedClock: data inválida — ${iso}`)
  }
  return { now: () => new Date(time) }
}
