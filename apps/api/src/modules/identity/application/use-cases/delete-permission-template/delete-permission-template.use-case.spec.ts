import { PermissionTemplate } from "../../../domain/entities/permission-template.entity"
import { PermissionTemplateNotFoundError } from "../../../domain/errors"

import { DeletePermissionTemplateUseCase } from "./delete-permission-template.use-case"

function existingTemplate(): PermissionTemplate {
  return PermissionTemplate.fromProps({
    id: "t-1",
    name: "Recepção",
    description: null,
    permissions: ["admin.users.read"],
    createdAt: new Date("2026-06-12T12:00:00.000Z"),
    updatedAt: new Date("2026-06-12T12:00:00.000Z"),
  })
}

describe("DeletePermissionTemplateUseCase", () => {
  it("happy: deleta pelo id", async () => {
    const templates = {
      findById: jest.fn().mockResolvedValue(existingTemplate()),
      deleteById: jest.fn().mockResolvedValue(undefined),
    }
    const uc = new DeletePermissionTemplateUseCase(templates as never)
    await uc.execute({ id: "t-1" })
    expect(templates.deleteById).toHaveBeenCalledWith("t-1")
  })

  it("id inexistente → 404", async () => {
    const templates = {
      findById: jest.fn().mockResolvedValue(null),
      deleteById: jest.fn(),
    }
    const uc = new DeletePermissionTemplateUseCase(templates as never)
    await expect(uc.execute({ id: "x" })).rejects.toThrow(
      PermissionTemplateNotFoundError
    )
    expect(templates.deleteById).not.toHaveBeenCalled()
  })

  it("não encontrado → deleteById nunca chamado mesmo que repo aceite qualquer id", async () => {
    const templates = {
      findById: jest.fn().mockResolvedValue(undefined),
      deleteById: jest.fn().mockResolvedValue(undefined),
    }
    const uc = new DeletePermissionTemplateUseCase(templates as never)
    await expect(uc.execute({ id: "ghost" })).rejects.toBeInstanceOf(
      PermissionTemplateNotFoundError
    )
    expect(templates.findById).toHaveBeenCalledWith("ghost")
    expect(templates.deleteById).not.toHaveBeenCalled()
  })

  it("happy: findById chamado com o id exato antes de deletar", async () => {
    const templates = {
      findById: jest.fn().mockResolvedValue(existingTemplate()),
      deleteById: jest.fn().mockResolvedValue(undefined),
    }
    const uc = new DeletePermissionTemplateUseCase(templates as never)
    await uc.execute({ id: "t-1" })
    expect(templates.findById).toHaveBeenCalledWith("t-1")
    expect(templates.findById).toHaveBeenCalledTimes(1)
    expect(templates.deleteById).toHaveBeenCalledTimes(1)
  })
})
