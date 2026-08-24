import { existsSync, readFileSync, writeFileSync } from "node:fs"

export function readLock(filePath) {
  if (!existsSync(filePath)) {
    return { modules: {} }
  }
  const raw = readFileSync(filePath, "utf8")
  return JSON.parse(raw)
}

export function writeLock(filePath, lock) {
  writeFileSync(filePath, `${JSON.stringify(lock, null, 2)}\n`, "utf8")
}
