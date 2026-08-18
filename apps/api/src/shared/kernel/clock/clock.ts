/** Relógio injetável — abstrai `Date` para tornar o tempo testável. */
export interface Clock {
  now(): Date
}

export const CLOCK = Symbol("Clock")
