import { Injectable } from "@nestjs/common"

import type { Clock } from "./clock"

/** Relógio real do sistema. Em teste, injetar um fake que retorna `Date` fixo. */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}
