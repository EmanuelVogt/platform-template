export const SLOT_TYPES = [
  "available",
  "lunch",
  "break",
  "meeting",
  "administrative",
] as const

export type SlotType = (typeof SLOT_TYPES)[number]

export function isSlotType(value: string): value is SlotType {
  return (SLOT_TYPES as readonly string[]).includes(value)
}

export function isAvailabilitySlot(type: SlotType): boolean {
  return type === "available"
}

export interface WeeklySlot {
  readonly type: SlotType
  readonly dayOfWeek: number
  readonly startMinute: number
  readonly endMinute: number
}

export interface WeeklySlotOffender {
  index: number
  slot: WeeklySlot
  reason: "invalid-type" | "invalid-day" | "invalid-window" | "overlap"
}

export interface MinuteSpan {
  startMinute: number
  endMinute: number
}

const MINUTES_IN_DAY = 1440

function isValidMinuteWindow(start: number, end: number): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    start < MINUTES_IN_DAY &&
    end > start &&
    end <= MINUTES_IN_DAY
  )
}

// Overlap só é erro dentro da mesma classe: bloqueio sobre disponibilidade é o
// recorte intencional (espelha o EXCLUDE chaveado em is_availability).
export function validateWeeklySlots(
  slots: readonly WeeklySlot[]
): WeeklySlotOffender[] {
  const offenders: WeeklySlotOffender[] = []
  const valid: { slot: WeeklySlot; index: number }[] = []
  slots.forEach((slot, index) => {
    if (!isSlotType(slot.type)) {
      offenders.push({ index, slot, reason: "invalid-type" })
    } else if (
      !Number.isInteger(slot.dayOfWeek) ||
      slot.dayOfWeek < 0 ||
      slot.dayOfWeek > 6
    ) {
      offenders.push({ index, slot, reason: "invalid-day" })
    } else if (!isValidMinuteWindow(slot.startMinute, slot.endMinute)) {
      offenders.push({ index, slot, reason: "invalid-window" })
    } else {
      valid.push({ slot, index })
    }
  })

  const maxEndByKey = new Map<string, number>()
  for (const { slot, index } of [...valid].sort(
    (a, b) => a.slot.startMinute - b.slot.startMinute
  )) {
    const key = `${isAvailabilitySlot(slot.type) ? "a" : "b"}|${String(slot.dayOfWeek)}`
    const maxEnd = maxEndByKey.get(key)
    if (maxEnd !== undefined && slot.startMinute < maxEnd) {
      offenders.push({ index, slot, reason: "overlap" })
    }
    maxEndByKey.set(key, Math.max(maxEnd ?? 0, slot.endMinute))
  }
  return offenders
}

export function subtractSpans(
  base: readonly MinuteSpan[],
  cuts: readonly MinuteSpan[]
): MinuteSpan[] {
  const sortedCuts = [...cuts].sort((a, b) => a.startMinute - b.startMinute)
  const result: MinuteSpan[] = []
  for (const span of [...base].sort((a, b) => a.startMinute - b.startMinute)) {
    let cursor = span.startMinute
    for (const cut of sortedCuts) {
      if (cut.endMinute <= cursor || cut.startMinute >= span.endMinute) continue
      if (cut.startMinute > cursor) {
        result.push({ startMinute: cursor, endMinute: cut.startMinute })
      }
      cursor = Math.max(cursor, cut.endMinute)
      if (cursor >= span.endMinute) break
    }
    if (cursor < span.endMinute) {
      result.push({ startMinute: cursor, endMinute: span.endMinute })
    }
  }
  return result
}

// Dia sem disponibilidade líquida (available − bloqueios) é omitido do Map.
export function effectiveWindowsByDay(
  slots: readonly WeeklySlot[]
): Map<number, MinuteSpan[]> {
  const availByDay = new Map<number, MinuteSpan[]>()
  const blockByDay = new Map<number, MinuteSpan[]>()
  for (const slot of slots) {
    const target = isAvailabilitySlot(slot.type) ? availByDay : blockByDay
    const spans = target.get(slot.dayOfWeek) ?? []
    spans.push({ startMinute: slot.startMinute, endMinute: slot.endMinute })
    target.set(slot.dayOfWeek, spans)
  }
  const result = new Map<number, MinuteSpan[]>()
  for (const [day, avail] of availByDay) {
    const net = subtractSpans(avail, blockByDay.get(day) ?? [])
    if (net.length > 0) result.set(day, net)
  }
  return result
}

export function intersectSpans(
  a: readonly MinuteSpan[],
  b: readonly MinuteSpan[]
): MinuteSpan[] {
  const sortedA = [...a].sort((x, y) => x.startMinute - y.startMinute)
  const sortedB = [...b].sort((x, y) => x.startMinute - y.startMinute)
  const result: MinuteSpan[] = []
  let i = 0
  let j = 0
  let spanA = sortedA[i]
  let spanB = sortedB[j]
  while (spanA && spanB) {
    const start = Math.max(spanA.startMinute, spanB.startMinute)
    const end = Math.min(spanA.endMinute, spanB.endMinute)
    if (start < end) result.push({ startMinute: start, endMinute: end })
    if (spanA.endMinute <= spanB.endMinute) {
      i += 1
      spanA = sortedA[i]
    } else {
      j += 1
      spanB = sortedB[j]
    }
  }
  return result
}
