import { describe, expect, it, vi } from "vitest"

import { PermissionTemplate } from "../../../domain/entities/permission-template.entity"
import {
  InvalidPermissionSetError,
  PermissionTemplateNameInUseError,
  PermissionTemplateNotFoundError,
} from "../../../domain/errors"

import { UpdatePermissionTemplateUseCase } from "./update-permission-template.use-case"

const NOW = new Date("2026-06-12T12:00:00.000Z")

function existingTemplate(): PermissionTemplate {
  return PermissionTemplate.fromProps({
    id: "t-1",
    name: "Recepção",
    description: null,
    permissions: ["admin.users.read"],
    createdAt: NOW,
    updatedAt: NOW,
  })
}

const BASE_INPUT = {
  id: "t-1",
  name: "Recepção v2",
  description: "desc",
  permissions: ["admin.users.read" as const],
}

function makeDeps(over: Record<string, any> = {}) {
  const templates = over.templates ?? {
    findById: vi.fn().mockResolvedValue(existingTemplate()),
    findByName: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
  }
  const clock = { now: () => new Date("2026-06-13T00:00:00.000Z") }
  const uc = new UpdatePermissionTemplateUseCase(templates, clock)
  return { uc, templates }
}

describe("UpdatePermissionTemplateUseCase", () => {
  it("happy: atualiza e devolve a view nova", async () => {
    const { uc, templates } = makeDeps()
    const out = await uc.execute(BASE_INPUT)
    expect(templates.update).toHaveBeenCalledTimes(1)
    expect(out.template.name).toBe("Recepção v2")
  })

  it("id inexistente → 404 e não consulta nome nem persiste", async () => {
    const findByName = vi.fn()
    const update = vi.fn()
    const { uc } = makeDeps({
      templates: {
        findById: vi.fn().mockResolvedValue(null),
        findByName,
        update,
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(
      PermissionTemplateNotFoundError
    )
    expect(findByName).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("nome colidindo com OUTRO id → 409", async () => {
    const other = PermissionTemplate.fromProps({
      ...existingTemplate().props,
      id: "t-2",
    })
    const { uc, templates } = makeDeps({
      templates: {
        findById: vi.fn().mockResolvedValue(existingTemplate()),
        findByName: vi.fn().mockResolvedValue(other),
        update: vi.fn(),
      },
    })
    await expect(uc.execute(BASE_INPUT)).rejects.toThrow(
      PermissionTemplateNameInUseError
    )
    expect(templates.update).not.toHaveBeenCalled()
  })

  it("mesmo nome no próprio id NÃO é colisão", async () => {
    const { uc, templates } = makeDeps({
      templates: {
        findById: vi.fn().mockResolvedValue(existingTemplate()),
        findByName: vi.fn().mockResolvedValue(existingTemplate()),
        update: vi.fn().mockResolvedValue(undefined),
      },
    })
    await uc.execute(BASE_INPUT)
    expect(templates.update).toHaveBeenCalledTimes(1)
  })

  it("nome não existe no banco → persiste sem erro (sameName null)", async () => {
    const { uc, templates } = makeDeps({
      templates: {
        findById: vi.fn().mockResolvedValue(existingTemplate()),
        findByName: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    })
    await uc.execute(BASE_INPUT)
    expect(templates.update).toHaveBeenCalledTimes(1)
  })

  it("description nula é preservada na atualização", async () => {
    const { uc, templates } = makeDeps()
    const out = await uc.execute({ ...BASE_INPUT, description: null })
    expect(out.template.description).toBeNull()
    expect(templates.update).toHaveBeenCalledTimes(1)
  })

  it("set sem closure → 422", async () => {
    const { uc } = makeDeps()
    await expect(
      uc.execute({ ...BASE_INPUT, permissions: ["admin.users.create"] })
    ).rejects.toThrow(InvalidPermissionSetError)
  })
})
