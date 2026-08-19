import type { Device } from "../entities/device.entity"

/** Projeção de leitura: device + agregados derivados das sessões (D2). */
export type DeviceWithActivity = {
  id: string
  firstSeenAt: Date
  lastSeenAt: Date
  ipAddress: string | null
  userAgent: string | null
  activeSessionCount: number
}

export interface DeviceRepository {
  create(device: Device): Promise<void>
  /** Acha o device do browser para ESTE user (escopo anti-IDOR). */
  findByUserAndCookieHash(
    userId: string,
    cookieTokenHash: string
  ): Promise<Device | null>
  /** Devices com ≥1 sessão ativa + agregados (last_seen/ip/ua/count). */
  listActiveByUser(
    userId: string,
    now: Date,
    idleTtlSeconds: number,
    absoluteTtlSeconds: number
  ): Promise<DeviceWithActivity[]>
  /** Apaga por id com escopo pelo dono. Cascade derruba as sessões. RowCount. */
  deleteById(id: string, userId: string): Promise<number>
  /**
   * Revoga todos os devices do user exceto o atual. `currentDeviceId` null
   * (sessão órfã, D1) → apaga TODOS os devices (não há atual a preservar).
   */
  deleteOthers(userId: string, currentDeviceId: string | null): Promise<void>
}

export const DEVICE_REPOSITORY: unique symbol = Symbol("DeviceRepository")
