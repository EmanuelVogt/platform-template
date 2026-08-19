import { QueryClient } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/shared/store/auth.store"

import { requireAccess, requireAnon, resolveRootRedirect } from "./guards"
import { productRoutes } from "./product-routes"
import { createAppRouter, router } from "./router"

import type { AnyRouteMatch } from "@tanstack/react-router"

const { sessionFetch } = vi.hoisted(() => ({ sessionFetch: vi.fn() }))

vi.mock("@platform/api-client/hooks/useGetSession", () => ({
  getSession: sessionFetch,
}))

const user = {
  id: "u-1",
  name: "Ana",
  email: "ana@x.com",
  emailVerified: true,
  accessProfile: "admin",
  permissions: ["produto.exemplo.read"],
  avatarAttachmentId: null,
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function matchesFor(access: unknown): readonly AnyRouteMatch[] {
  return [{ staticData: { access } } as unknown as AnyRouteMatch]
}

describe("guards de rota", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ redirectIntent: null })
    localStorage.clear()
  })
  afterEach(() => {
    useAuthStore.setState({ redirectIntent: null })
    localStorage.clear()
  })

  describe("requireAccess", () => {
    it("não redireciona quando há sessão e a rota é self", async () => {
      sessionFetch.mockResolvedValue({ user })
      await expect(
        requireAccess(makeClient(), "/inicio", matchesFor({ kind: "self" }))
      ).resolves.toBeUndefined()
    })

    it("não redireciona quando a permissão exigida está no set", async () => {
      sessionFetch.mockResolvedValue({ user })
      await expect(
        requireAccess(
          makeClient(),
          "/inicio",
          matchesFor({ kind: "permission", permission: "produto.exemplo.read" })
        )
      ).resolves.toBeUndefined()
    })


    it("aceita quando o usuário tem uma permissão do array", async () => {
      sessionFetch.mockResolvedValue({ user })
      await expect(
        requireAccess(
          makeClient(),
          "/inicio",
          matchesFor({
            kind: "permission",
            permission: ["produto.exemplo.read", "produto.outra.read"],
          }),
        ),
      ).resolves.toBeUndefined()
    })

    it("redireciona quando falta todas as permissões do array", async () => {
      sessionFetch.mockResolvedValue({ user })
      await expect(
        requireAccess(
          makeClient(),
          "/inicio",
          matchesFor({
            kind: "permission",
            permission: ["produto.outra.read", "produto.mais.read"],
          }),
        ),
      ).rejects.toBeDefined()
    })

    it("redireciona quando falta a permissão exigida", async () => {
      sessionFetch.mockResolvedValue({ user })
      await expect(
        requireAccess(
          makeClient(),
          "/inicio",
          matchesFor({ kind: "permission", permission: "produto.outra.read" })
        )
      ).rejects.toBeDefined()
    })

    it("redireciona anon para LOGIN guardando a intenção", async () => {
      sessionFetch.mockRejectedValue(new Error("401"))
      await expect(
        requireAccess(makeClient(), "/inicio", matchesFor({ kind: "self" }))
      ).rejects.toBeDefined()
      expect(useAuthStore.getState().redirectIntent).toBe("/inicio")
    })
  })

  describe("requireAnon", () => {
    it("redireciona usuário autenticado para fora do login", async () => {
      sessionFetch.mockResolvedValue({ user })
      await expect(requireAnon(makeClient())).rejects.toBeDefined()
    })

    it("não redireciona quando anon", async () => {
      sessionFetch.mockRejectedValue(new Error("401"))
      await expect(requireAnon(makeClient())).resolves.toBeUndefined()
    })
  })

  describe("resolveRootRedirect", () => {
    it("manda anon para o login", async () => {
      sessionFetch.mockRejectedValue(new Error("401"))
      await expect(resolveRootRedirect(makeClient())).rejects.toMatchObject({
        options: { to: "/entrar" },
      })
    })

    it("manda authed para o início", async () => {
      sessionFetch.mockResolvedValue({ user })
      await expect(resolveRootRedirect(makeClient())).rejects.toMatchObject({
        options: { to: "/inicio" },
      })
    })
  })
})

describe("routeTree", () => {
  it("registra a raiz, o login, o layout autenticado e o início", () => {
    expect(Object.keys(router.routesById).sort()).toEqual([
      "/",
      "/authenticated",
      "/authenticated/inicio",
      "/entrar",
      "__root__",
    ])
  })

  it("sobe sem rota de produto — a lista é a costura de extensão", () => {
    expect(productRoutes).toHaveLength(0)
  })
})


describe("createAppRouter", () => {
  it("serializa arrays de string como CSV na query", () => {
    const client = makeClient()
    const appRouter = createAppRouter({ queryClient: client })
    expect(appRouter.options.stringifySearch({ layers: ["a", "b"] })).toBe(
      "?layers=a%2Cb",
    )
  })

  it("serializa arrays mistos como JSON", () => {
    const client = makeClient()
    const appRouter = createAppRouter({ queryClient: client })
    expect(appRouter.options.stringifySearch({ layers: ["a", 1] })).toBe(
      '?layers=%5B%22a%22%2C1%5D',
    )
  })

  it("serializa valores não-array como JSON", () => {
    const client = makeClient()
    const appRouter = createAppRouter({ queryClient: client })
    expect(appRouter.options.stringifySearch({ n: 1 })).toBe("?n=1")
  })
})
