import { Device } from "./device.entity"

describe("Device", () => {
  it("create gera ulid, firstSeenAt default e congela props", () => {
    const d = Device.create({ userId: "u-1", cookieTokenHash: "h" })
    expect(d.props.id).toHaveLength(26)
    expect(d.props.userId).toBe("u-1")
    expect(d.props.cookieTokenHash).toBe("h")
    expect(d.props.label).toBeNull()
    expect(d.props.firstSeenAt).toBeInstanceOf(Date)
    expect(Object.isFrozen(d.props)).toBe(true)
    expect(() => {
      // @ts-expect-error props é readonly + frozen
      d.props.userId = "x"
    }).toThrow()
  })

  it("fromProps hidrata sem gerar id", () => {
    const props = {
      id: "01J",
      userId: "u-1",
      cookieTokenHash: "h",
      label: "Meu PC",
      firstSeenAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    }
    const d = Device.fromProps(props)
    expect(d.props).toEqual(props)
  })
})
