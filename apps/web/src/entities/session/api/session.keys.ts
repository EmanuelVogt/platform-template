export const sessionKeys = {
  all: ["session"] as const,
  current: () => [...sessionKeys.all, "current"] as const,
  devices: () => [...sessionKeys.all, "devices"] as const,
}
