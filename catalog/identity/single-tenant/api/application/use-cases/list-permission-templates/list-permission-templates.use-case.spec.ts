import { describe, expect, it, vi } from "vitest"

import { PermissionTemplate } from "../../../domain/entities/permission-template.entity"

import { ListPermissionTemplatesUseCase } from "./list-permission-templates.use-case"

import type { PermissionKey } from "../../../domain/permissions/permission-catalog"

const NOW = new Date("2026-06-16T00:00:00.000Z")

function makeTemplate(
  over: { id?: string; name?: string; permissions?: PermissionKey[] } = {}
): PermissionTemplate {
  return PermissionTemplate.fromProps({
    id: over.id ?? "tpl-1",
    name: over.name ?? "Operador",
    description: "Permissões básicas de operação",
    permissions: over.permissions ?? ["admin.users.read"],
    createdAt: NOW,
    updatedAt: NOW,
  })
}

function makeDeps(over: Record<string, any> = {}) {
  const templates = over.templates ?? {
    listAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    findByName: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  }
  const uc = new ListPermissionTemplatesUseCase(templates)
  return { uc, templates }
}

describe("ListPermissionTemplatesUseCase", () => {
  it("repositório vazio retorna lista vazia", async () => {
    const t = makeDeps()
    const out = await t.uc.execute()
    expect(out.templates).toEqual([])
    expect(t.templates.listAll).toHaveBeenCalledTimes(1)
  })

  it("retorna todos os templates mapeados para view com campos corretos", async () => {
    const tplA = makeTemplate({
      id: "tpl-a",
      name: "Admin",
      permissions: ["admin.users.read", "admin.users.create"],
    })
    const tplB = makeTemplate({
      id: "tpl-b",
      name: "Viewer",
      permissions: ["admin.users.read"],
    })
    const t = makeDeps({
      templates: {
        listAll: vi.fn().mockResolvedValue([tplA, tplB]),
        findById: vi.fn(),
        findByName: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        deleteById: vi.fn(),
      },
    })

    const out = await t.uc.execute()

    expect(out.templates).toHaveLength(2)

    expect(out.templates[0]).toEqual({
      id: "tpl-a",
      name: "Admin",
      description: "Permissões básicas de operação",
      permissions: ["admin.users.read", "admin.users.create"],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })

    expect(out.templates[1]).toEqual({
      id: "tpl-b",
      name: "Viewer",
      description: "Permissões básicas de operação",
      permissions: ["admin.users.read"],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })
  })

  it("não chama insert, update nem deleteById — somente listAll", async () => {
    const tpl = makeTemplate()
    const t = makeDeps({
      templates: {
        listAll: vi.fn().mockResolvedValue([tpl]),
        findById: vi.fn(),
        findByName: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        deleteById: vi.fn(),
      },
    })

    await t.uc.execute()

    expect(t.templates.insert).not.toHaveBeenCalled()
    expect(t.templates.update).not.toHaveBeenCalled()
    expect(t.templates.deleteById).not.toHaveBeenCalled()
    expect(t.templates.findById).not.toHaveBeenCalled()
    expect(t.templates.findByName).not.toHaveBeenCalled()
  })

  it("preserva a ordem retornada pelo repositório", async () => {
    const tpls = ["Zebra", "Alpha", "Médio"].map((name, i) =>
      makeTemplate({ id: `tpl-${i}`, name })
    )
    const t = makeDeps({
      templates: {
        listAll: vi.fn().mockResolvedValue(tpls),
        findById: vi.fn(),
        findByName: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        deleteById: vi.fn(),
      },
    })

    const out = await t.uc.execute()

    expect(out.templates.map((v) => v.name)).toEqual([
      "Zebra",
      "Alpha",
      "Médio",
    ])
  })

  it("description null é preservado na view", async () => {
    const tpl = PermissionTemplate.fromProps({
      id: "tpl-null-desc",
      name: "Sem descrição",
      description: null,
      permissions: ["admin.users.read"],
      createdAt: NOW,
      updatedAt: NOW,
    })
    const t = makeDeps({
      templates: {
        listAll: vi.fn().mockResolvedValue([tpl]),
        findById: vi.fn(),
        findByName: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        deleteById: vi.fn(),
      },
    })

    const out = await t.uc.execute()

    expect(out.templates[0]?.description).toBeNull()
  })
})
