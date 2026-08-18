import { PermissionTemplate } from "../../../domain/entities/permission-template.entity"
import {
  InvalidPermissionSetError,
  PermissionTemplateNameInUseError,
} from "../../../domain/errors"

import { CreatePermissionTemplateUseCase } from "./create-permission-template.use-case"

const NOW = new Date("2026-06-12T12:00:00.000Z")

function makeDeps(over: Record<string, any> = {}) {
  const templates = over.templates ?? {
    findByName: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
  }
  const clock = { now: () => NOW }
  const uc = new CreatePermissionTemplateUseCase(templates, clock)
  return { uc, templates }
}

describe("CreatePermissionTemplateUseCase", () => {
  it("happy: cria, persiste e devolve a view", async () => {
    const { uc, templates } = makeDeps()
    const out = await uc.execute({
      name: "Recepção",
      description: null,
      permissions: ["admin.users.read"],
    })
    expect(templates.insert).toHaveBeenCalledTimes(1)
    expect(out.template.name).toBe("Recepção")
    expect(out.template.permissions).toEqual(["admin.users.read"])
  })

  it("nome em uso → 409", async () => {
    const existing = PermissionTemplate.create(
      { name: "Recepção", description: null, permissions: ["admin.users.read"] },
      NOW
    )
    const { uc, templates } = makeDeps({
      templates: {
        findByName: jest.fn().mockResolvedValue(existing),
        insert: jest.fn(),
      },
    })
    await expect(
      uc.execute({
        name: "Recepção",
        description: null,
        permissions: ["admin.users.read"],
      })
    ).rejects.toThrow(PermissionTemplateNameInUseError)
    expect(templates.insert).not.toHaveBeenCalled()
  })

  it("set sem closure → 422", async () => {
    const { uc, templates } = makeDeps()
    await expect(
      uc.execute({
        name: "X",
        description: null,
        permissions: ["admin.users.create"],
      })
    ).rejects.toThrow(InvalidPermissionSetError)
    expect(templates.insert).not.toHaveBeenCalled()
  })
})
