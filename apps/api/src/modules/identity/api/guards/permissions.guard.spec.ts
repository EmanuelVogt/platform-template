import "reflect-metadata"

import {
  OptionalAuth,
  Public,
  RequireAnyPermission,
  RequirePermission,
  SelfService,
} from "../../../../shared/kernel/access/decorators"
import { ForbiddenError } from "../../../../shared/kernel/errors/forbidden.error"

import { PermissionsGuard } from "./permissions.guard"

import type { ExecutionContext } from "@nestjs/common"
import type * as NestCore from "@nestjs/core"

class Routes {
  @Public()
  publicRoute(): void {
    return
  }

  @SelfService()
  selfRoute(): void {
    return
  }

  @OptionalAuth()
  optionalRoute(): void {
    return
  }

  @RequirePermission("admin.users.read")
  guardedRoute(): void {
    return
  }

  @RequireAnyPermission([
    "admin.users.audit.read",
    "admin.tags.audit.read",
  ])
  anyRoute(): void {
    return
  }

  undeclaredRoute(): void {
    return
  }
}

function contextFor(handlerName: keyof Routes): ExecutionContext {
  return {
    getHandler: () => Routes.prototype[handlerName],
    getClass: () => Routes,
  } as unknown as ExecutionContext
}

function makeGuard(over: {
  userId?: string | null
  accessProfile?: "master" | "admin"
  permissions?: string[]
  deleted?: boolean
  notFound?: boolean
}) {
  const user = {
    isMaster: () => (over.accessProfile ?? "admin") === "master",
    isDeleted: () => over.deleted ?? false,
    props: { id: over.userId ?? "u-1" },
  }
  const users = {
    findByIdWithPermissions: jest.fn().mockResolvedValue(
      over.notFound === true
        ? null
        : {
            user,
            permissions: over.permissions ?? [],
          }
    ),
  }
  const ctx = {
    get: () => ({ userId: over.userId ?? "u-1" }),
    setAccess: jest.fn(),
  }
  const { Reflector } = jest.requireActual<typeof NestCore>("@nestjs/core")
  const guard = new PermissionsGuard(
    users as never,
    new Reflector(),
    ctx as never
  )
  return { guard, users, ctx }
}

describe("PermissionsGuard", () => {
  it("@Public e @OptionalAuth pulam sem carregar user nem popular access", async () => {
    const { guard, users, ctx } = makeGuard({})
    await expect(guard.canActivate(contextFor("publicRoute"))).resolves.toBe(
      true
    )
    await expect(
      guard.canActivate(contextFor("optionalRoute"))
    ).resolves.toBe(true)
    expect(users.findByIdWithPermissions).not.toHaveBeenCalled()
    expect(ctx.setAccess).not.toHaveBeenCalled()
  })

  it("@SelfService pula a exigência de permissão mas carrega o user e popula access", async () => {
    const { guard, users, ctx } = makeGuard({
      permissions: ["admin.users.read"],
    })
    await expect(guard.canActivate(contextFor("selfRoute"))).resolves.toBe(
      true
    )
    expect(users.findByIdWithPermissions).toHaveBeenCalledWith("u-1")
    expect(ctx.setAccess).toHaveBeenCalledWith({
      permissions: new Set(["admin.users.read"]),
      isMaster: false,
    })
  })

  it("@SelfService com usuário inexistente segue liberado com access nulo", async () => {
    const { guard, ctx } = makeGuard({ notFound: true })
    await expect(guard.canActivate(contextFor("selfRoute"))).resolves.toBe(
      true
    )
    expect(ctx.setAccess).not.toHaveBeenCalled()
  })

  it("@SelfService com usuário soft-deleted segue liberado com access nulo", async () => {
    const { guard, ctx } = makeGuard({ deleted: true })
    await expect(guard.canActivate(contextFor("selfRoute"))).resolves.toBe(
      true
    )
    expect(ctx.setAccess).not.toHaveBeenCalled()
  })

  it("rota sem declaração → ForbiddenError (fail-closed)", async () => {
    const { guard } = makeGuard({})
    await expect(
      guard.canActivate(contextFor("undeclaredRoute"))
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("chave presente no set → passa", async () => {
    const { guard } = makeGuard({ permissions: ["admin.users.read"] })
    await expect(guard.canActivate(contextFor("guardedRoute"))).resolves.toBe(
      true
    )
  })

  it("chave ausente → 403", async () => {
    const { guard } = makeGuard({ permissions: [] })
    await expect(
      guard.canActivate(contextFor("guardedRoute"))
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("master bypassa sem checar o set", async () => {
    const { guard } = makeGuard({ accessProfile: "master", permissions: [] })
    await expect(guard.canActivate(contextFor("guardedRoute"))).resolves.toBe(
      true
    )
  })

  it("usuário soft-deleted → 403", async () => {
    const { guard } = makeGuard({
      permissions: ["admin.users.read"],
      deleted: true,
    })
    await expect(
      guard.canActivate(contextFor("guardedRoute"))
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("anyOf: uma das chaves basta", async () => {
    const { guard } = makeGuard({
      permissions: ["admin.tags.audit.read"],
    })
    await expect(guard.canActivate(contextFor("anyRoute"))).resolves.toBe(true)
  })

  it("anyOf: nenhuma chave → 403", async () => {
    const { guard } = makeGuard({ permissions: ["admin.users.read"] })
    await expect(
      guard.canActivate(contextFor("anyRoute"))
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("anyOf: master bypassa", async () => {
    const { guard } = makeGuard({ accessProfile: "master", permissions: [] })
    await expect(guard.canActivate(contextFor("anyRoute"))).resolves.toBe(true)
  })

  it("popula RequestContext.access com set e flag master", async () => {
    const { guard, ctx } = makeGuard({ permissions: ["admin.users.read"] })
    await guard.canActivate(contextFor("guardedRoute"))
    expect(ctx.setAccess).toHaveBeenCalledWith({
      permissions: new Set(["admin.users.read"]),
      isMaster: false,
    })
  })
})
