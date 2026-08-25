export type AccessProfileDef = {
  readonly key: string
  readonly label: string
  readonly assignable: boolean
  readonly permissionFloor: boolean
}

export const BASE_ACCESS_PROFILES = [
  { key: "master", label: "Master", assignable: false, permissionFloor: false },
  {
    key: "admin",
    label: "Administrador",
    assignable: true,
    permissionFloor: true,
  },
] as const satisfies readonly AccessProfileDef[]
