import { AccessPolicy } from "./access-policy"

describe("AccessPolicy.canBeReadBy", () => {
  it("public: qualquer um, mesmo anônimo", () => {
    const p = new AccessPolicy("public")
    expect(p.canBeReadBy(null, "owner-1")).toBe(true)
    expect(p.canBeReadBy("u-1", null)).toBe(true)
  })

  it("authenticated: exige userId, ignora owner", () => {
    const p = new AccessPolicy("authenticated")
    expect(p.canBeReadBy(null, "owner-1")).toBe(false)
    expect(p.canBeReadBy("u-9", "owner-1")).toBe(true)
  })

  it("restricted: só o dono", () => {
    const p = new AccessPolicy("restricted")
    expect(p.canBeReadBy("owner-1", "owner-1")).toBe(true)
    expect(p.canBeReadBy("u-2", "owner-1")).toBe(false)
    expect(p.canBeReadBy(null, "owner-1")).toBe(false)
    expect(p.canBeReadBy("u-2", null)).toBe(false)
  })
})
