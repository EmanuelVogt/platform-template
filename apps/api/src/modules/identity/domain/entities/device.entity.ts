import { ulid } from "ulid"

export interface DeviceProps {
  readonly id: string
  readonly userId: string
  readonly cookieTokenHash: string
  readonly label: string | null
  readonly firstSeenAt: Date
  readonly createdAt: Date
}

export interface CreateDeviceInput {
  userId: string
  cookieTokenHash: string
  label?: string | null
  firstSeenAt?: Date
}

export class Device {
  readonly props: DeviceProps

  private constructor(props: DeviceProps) {
    this.props = Object.freeze(props)
  }

  static fromProps(props: DeviceProps): Device {
    return new Device(props)
  }

  static create({
    userId,
    cookieTokenHash,
    label,
    firstSeenAt,
  }: CreateDeviceInput): Device {
    const now = new Date()
    return new Device({
      id: ulid(),
      userId,
      cookieTokenHash,
      label: label ?? null,
      firstSeenAt: firstSeenAt ?? now,
      createdAt: now,
    })
  }
}
