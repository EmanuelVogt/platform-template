import { describe, expect, it, vi } from "vitest"

import { mockOf } from "./mock-of"

type Repo = {
  findById: (id: string) => Promise<string | null>
  save: (value: string) => Promise<void>
}

describe("mockOf", () => {
  it("devolve o dublê fornecido para o método declarado", async () => {
    const repo = mockOf<Repo>({ findById: vi.fn().mockResolvedValue("u1") })

    await expect(repo.findById("u1")).resolves.toBe("u1")
    expect(repo.findById).toHaveBeenCalledWith("u1")
  })

  it("um método não estubado rejeita nomeando a si mesmo", async () => {
    const repo = mockOf<Repo>({ findById: vi.fn() })

    await expect(repo.save("x")).rejects.toThrow("save not stubbed")
  })

  it("sem nada fornecido todo método rejeita nomeando a si mesmo", async () => {
    const repo = mockOf<Repo>()

    await expect(repo.findById("u1")).rejects.toThrow("findById not stubbed")
  })

  it("o mesmo método devolve sempre a mesma vi.fn, para poder ser asserido", async () => {
    const repo = mockOf<Repo>()
    const first = repo.save

    await expect(repo.save("x")).rejects.toThrow()
    expect(repo.save).toBe(first)
    expect(first).toHaveBeenCalledWith("x")
  })

  it("um estubo pode ser reatribuído depois de criado", async () => {
    const repo = mockOf<Repo>()
    repo.findById = vi.fn().mockResolvedValue(null)

    await expect(repo.findById("u1")).resolves.toBeNull()
  })
})
