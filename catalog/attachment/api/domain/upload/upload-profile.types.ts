export type UploadProfileDef = {
  readonly key: string
  readonly accept: "image" | "any"
  readonly maxBytes: number
  readonly maxTotalBytes: number
  readonly maxFiles: number
  readonly visibility: "public" | "authenticated" | "restricted"
  readonly uploadRoute: boolean
}
