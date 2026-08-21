import { OBJECT_STORAGE } from "./object-storage.port"

describe("OBJECT_STORAGE token", () => {
  it("é um symbol único para injeção", () => {
    expect(typeof OBJECT_STORAGE).toBe("symbol")
    expect(String(OBJECT_STORAGE)).toContain("ObjectStorage")
  })
})
