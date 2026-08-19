import { User } from "../../../domain/entities/user.entity"

import { ListUsersUseCase } from "./list-users.use-case"

import type { PaginatedResult } from "../../../../../shared/kernel/listing/paginated"
import type { UserListRow } from "../../../domain/ports/user.repository"

function makeUserRow(over: Partial<UserListRow> = {}): UserListRow {
  const user = User.fromProps({
    id: "u-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "hash",
    pepperVersion: 1,
    status: "active",
    emailVerified: true,
    pendingEmail: null,
    accessProfile: "admin",
    servesClients: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastResetRequestedAt: null,
    lastVerificationRequestedAt: null,
    lastEmailChangeRequestedAt: null,
    birthDate: null,
    avatarAttachmentId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    createdByUserId: null,
  })
  return {
    user,
    accessLinkExpiresAt: null,
    accessLinkExpired: false,
    permissions: [],
    areaIds: [],
    serviceIds: [],
    schedulingAreaIds: [],
    ...over,
  }
}

function makePaginatedResult(
  rows: UserListRow[],
  total = rows.length,
): PaginatedResult<UserListRow> {
  return {
    data: rows,
    page: { total, page: 1, pageSize: 20, totalPages: Math.ceil(total / 20) },
  }
}

function makeDeps(over: { listResult?: PaginatedResult<UserListRow> } = {}) {
  const listResult = over.listResult ?? makePaginatedResult([makeUserRow()])
  const users = {
    list: jest.fn().mockResolvedValue(listResult),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findVisibleById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    registerFailedAttempt: jest.fn(),
    findByIdForUpdate: jest.fn(),
    findByIdWithPermissions: jest.fn(),
    findPermissions: jest.fn(),
    replacePermissions: jest.fn(),
    replaceProfessionalAreas: jest.fn(),
    replaceProfessionalServices: jest.fn(),
    replaceSchedulingAreas: jest.fn(),
    findProfessionalScope: jest.fn(),
    findProfessionalAreaIdsByUserIds: jest.fn(),
    findByIds: jest.fn(),
    findStaleEmailChanges: jest.fn(),
    hardDeleteByIds: jest.fn(),
    existsActiveProfessional: jest.fn(),
    existsProfessional: jest.fn(),
    searchAssignableProfessionals: jest.fn(),
    findProfessionalsByIds: jest.fn(),
    listActiveProfessionals: jest.fn(),
    listActiveProfessionalsByArea: jest.fn(),
    findActiveProfessionalIdsByServices: jest.fn(),
    findActiveProfessionalLinksByServices: jest.fn(),
    findNamesByIds: jest.fn(),
    findIdsByNameLike: jest.fn(),
    findNotificationTargetsByPermission: jest.fn(),
  }
  const uc = new ListUsersUseCase(users)
  return { uc, users }
}

describe("ListUsersUseCase", () => {
  it("caminho feliz: delega ao repositório e mapeia cada row para UserListItemView", async () => {
    const { uc, users } = makeDeps()
    const input = { page: 1, pageSize: 20 }

    const out = await uc.execute(input)

    expect(users.list).toHaveBeenCalledTimes(1)
    expect(users.list).toHaveBeenCalledWith(input)
    expect(out.data).toHaveLength(1)
    // Garante projeção: campos sensíveis (passwordHash, pepperVersion) não vazam.
    expect(out.data[0]).toMatchObject({
      id: "u-1",
      name: "Ana",
      email: "ana@example.com",
      emailVerified: true,
      accessProfile: "admin",
      permissions: [],
      avatarAttachmentId: null,
      status: "active",
      accessLinkExpiresAt: null,
      accessLinkExpired: false,
      deletedAt: null,
    })
    expect(out.data[0]!.createdAt).toBe("2026-01-01T00:00:00.000Z")
  })

  it("repassa o envelope de paginação sem alterar page/total", async () => {
    const rows = [makeUserRow(), makeUserRow()]
    const listResult = makePaginatedResult(rows, 42)
    const { uc } = makeDeps({ listResult })

    const out = await uc.execute({ page: 3, pageSize: 10 })

    expect(out.page).toEqual({ total: 42, page: 1, pageSize: 20, totalPages: 3 })
  })

  it("repassa filtros (q, status, emailVerified, deleted) direto ao port", async () => {
    const { uc, users } = makeDeps({ listResult: makePaginatedResult([]) })
    const input = {
      page: 1,
      pageSize: 10,
      q: "ana",
      status: "pending" as const,
      emailVerified: false,
      deleted: true,
    }

    await uc.execute(input)

    expect(users.list).toHaveBeenCalledWith(input)
  })

  it("repassa sort e order ao port sem modificar", async () => {
    const { uc, users } = makeDeps({ listResult: makePaginatedResult([]) })
    const input = { page: 1, pageSize: 20, sort: "email" as const, order: "desc" as const }

    await uc.execute(input)

    expect(users.list).toHaveBeenCalledWith(input)
  })

  it("lista vazia: retorna data=[] e page sem erro", async () => {
    const { uc } = makeDeps({ listResult: makePaginatedResult([], 0) })

    const out = await uc.execute({ page: 1, pageSize: 20 })

    expect(out.data).toEqual([])
    expect(out.page.total).toBe(0)
  })

  it("accessLinkExpiresAt serializado em ISO quando não-nulo", async () => {
    const expiresAt = new Date("2026-06-01T12:00:00.000Z")
    const row = makeUserRow({ accessLinkExpiresAt: expiresAt, accessLinkExpired: true })
    const { uc } = makeDeps({ listResult: makePaginatedResult([row]) })

    const out = await uc.execute({ page: 1, pageSize: 20 })

    expect(out.data[0]!.accessLinkExpiresAt).toBe("2026-06-01T12:00:00.000Z")
    expect(out.data[0]!.accessLinkExpired).toBe(true)
  })

  it("deletedAt serializado em ISO para usuário soft-deleted", async () => {
    const deletedAt = new Date("2026-05-15T08:00:00.000Z")
    const user = User.fromProps({
      id: "u-2",
      name: "Bob",
      email: "bob@example.com",
      passwordHash: "hash",
      pepperVersion: 1,
      status: "active",
      emailVerified: false,
      pendingEmail: null,
      accessProfile: "admin",
      servesClients: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastResetRequestedAt: null,
      lastVerificationRequestedAt: null,
      lastEmailChangeRequestedAt: null,
      birthDate: null,
      avatarAttachmentId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt,
      createdByUserId: null,
    })
    const row: UserListRow = {
      user,
      accessLinkExpiresAt: null,
      accessLinkExpired: false,
      permissions: [],
      areaIds: [],
      serviceIds: [],
      schedulingAreaIds: [],
    }
    const { uc } = makeDeps({ listResult: makePaginatedResult([row]) })

    const out = await uc.execute({ page: 1, pageSize: 20 })

    expect(out.data[0]!.deletedAt).toBe("2026-05-15T08:00:00.000Z")
  })

  it("schedulingAreaIds da row são repassadas para a view", async () => {
    const row = makeUserRow({ schedulingAreaIds: ["area-1", "area-2"] })
    const { uc } = makeDeps({ listResult: makePaginatedResult([row]) })

    const out = await uc.execute({ page: 1, pageSize: 20 })

    expect(out.data[0]!.schedulingAreaIds).toEqual(["area-1", "area-2"])
  })

  it("permissions da row são repassadas para a view sem modificação", async () => {
    const row = makeUserRow({
      permissions: ["admin.users.read", "admin.users.create"],
    })
    const { uc } = makeDeps({ listResult: makePaginatedResult([row]) })

    const out = await uc.execute({ page: 1, pageSize: 20 })

    expect(out.data[0]!.permissions).toEqual([
      "admin.users.read",
      "admin.users.create",
    ])
  })

  it("repositório lança erro: propaga sem consumir outros métodos", async () => {
    const users = { list: jest.fn().mockRejectedValue(new Error("db offline")) }
    const uc = new ListUsersUseCase(users as never)

    await expect(uc.execute({ page: 1, pageSize: 20 })).rejects.toThrow("db offline")
    expect(users.list).toHaveBeenCalledTimes(1)
  })
})
