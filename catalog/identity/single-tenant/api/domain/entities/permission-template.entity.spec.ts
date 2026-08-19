import { PermissionTemplate } from "./permission-template.entity"

const NOW = new Date("2026-06-12T12:00:00.000Z")

describe("PermissionTemplate", () => {
  it("create gera id ULID, datas e deduplica permissões", () => {
    const t = PermissionTemplate.create(
      {
        name: "  Recepção  ",
        description: null,
        permissions: ["admin.users.read", "admin.users.read"],
      },
      NOW
    )
    expect(t.props.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(t.props.name).toBe("Recepção")
    expect(t.props.permissions).toEqual(["admin.users.read"])
    expect(t.props.createdAt).toBe(NOW)
    expect(t.props.updatedAt).toBe(NOW)
    expect(Object.isFrozen(t.props)).toBe(true)
  })

  it("update retorna nova instância com updatedAt novo, sem mutar a original", () => {
    const t = PermissionTemplate.create(
      { name: "A", description: null, permissions: ["admin.users.read"] },
      NOW
    )
    const later = new Date("2026-06-13T00:00:00.000Z")
    const updated = t.update(
      {
        name: "B",
        description: "desc",
        permissions: ["admin.users.read", "admin.users.create"],
      },
      later
    )
    expect(updated).not.toBe(t)
    expect(updated.props.name).toBe("B")
    expect(updated.props.description).toBe("desc")
    expect(updated.props.updatedAt).toBe(later)
    expect(updated.props.createdAt).toBe(NOW)
    expect(t.props.name).toBe("A")
  })
})
