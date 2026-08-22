import { describe, expect, it, vi } from "vitest"

import { PermissionTemplate } from "../../../domain/entities/permission-template.entity"
import { PermissionTemplateNotFoundError } from "../../../domain/errors"

import { GetPermissionTemplateUseCase } from "./get-permission-template.use-case"

describe("GetPermissionTemplateUseCase", () => {
  it("happy: devolve a view", async () => {
    const template = PermissionTemplate.fromProps({
      id: "t-1",
      name: "Recepção",
      description: null,
      permissions: ["admin.users.read"],
      createdAt: new Date("2026-06-12T12:00:00.000Z"),
      updatedAt: new Date("2026-06-12T12:00:00.000Z"),
    })
    const templates = { findById: vi.fn().mockResolvedValue(template) }
    const uc = new GetPermissionTemplateUseCase(templates as never)
    const out = await uc.execute({ id: "t-1" })
    expect(out.template.id).toBe("t-1")
    expect(out.template.createdAt).toBe("2026-06-12T12:00:00.000Z")
  })

  it("id inexistente → 404", async () => {
    const templates = { findById: vi.fn().mockResolvedValue(null) }
    const uc = new GetPermissionTemplateUseCase(templates as never)
    await expect(uc.execute({ id: "x" })).rejects.toThrow(
      PermissionTemplateNotFoundError
    )
  })

  it("não encontrado → findById chamado com o id recebido e nenhum save/update", async () => {
    const templates = { findById: vi.fn().mockResolvedValue(null) }
    const uc = new GetPermissionTemplateUseCase(templates as never)
    await expect(uc.execute({ id: "nao-existe" })).rejects.toThrow(
      PermissionTemplateNotFoundError
    )
    expect(templates.findById).toHaveBeenCalledTimes(1)
    expect(templates.findById).toHaveBeenCalledWith("nao-existe")
  })

  it("happy: description preenchida é mapeada no retorno", async () => {
    const template = PermissionTemplate.fromProps({
      id: "t-2",
      name: "Gerência",
      description: "Acesso gerencial completo",
      permissions: ["admin.users.read", "admin.users.update"],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    })
    const templates = { findById: vi.fn().mockResolvedValue(template) }
    const uc = new GetPermissionTemplateUseCase(templates as never)
    const out = await uc.execute({ id: "t-2" })
    expect(out.template.description).toBe("Acesso gerencial completo")
    expect(out.template.permissions).toEqual(["admin.users.read", "admin.users.update"])
    expect(templates.findById).toHaveBeenCalledWith("t-2")
  })

  it("happy: findById chamado exatamente com o id do input", async () => {
    const template = PermissionTemplate.fromProps({
      id: "t-abc",
      name: "Admin",
      description: null,
      permissions: [],
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    const templates = { findById: vi.fn().mockResolvedValue(template) }
    const uc = new GetPermissionTemplateUseCase(templates as never)
    await uc.execute({ id: "t-abc" })
    expect(templates.findById).toHaveBeenCalledTimes(1)
    expect(templates.findById).toHaveBeenCalledWith("t-abc")
  })
})
