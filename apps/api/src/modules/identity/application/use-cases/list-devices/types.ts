import type { DeviceView } from "../../views"

export type ListDevicesInput = Record<string, never>
export type ListDevicesOutput = { devices: DeviceView[] }
