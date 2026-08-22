import { PasswordHashingSaturatedError } from "../../domain/errors"

import { BoundedPasswordHasher } from "./bounded-password-hasher"

import type { PasswordHasher } from "../../domain/ports/password-hasher"

/** Hasher interno cujas promessas só resolvem quando o teste mandar. */
function pendingHasher() {
  const pending: Array<(value: never) => void> = []
  const inner: PasswordHasher & {
    hash: jest.Mock
    verify: jest.Mock
    needsRehash: jest.Mock
  } = {
    hash: jest.fn(
      () => new Promise<string>((resolve) => pending.push(resolve as never)),
    ),
    verify: jest.fn(
      () => new Promise<boolean>((resolve) => pending.push(resolve as never)),
    ),
    needsRehash: jest.fn().mockReturnValue(false),
  }
  return { inner, pending }
}

describe("BoundedPasswordHasher", () => {
  it("a 9ª chamada com 8 em voo é 503 e não chega ao argon2", async () => {
    const { inner } = pendingHasher()
    const hasher = new BoundedPasswordHasher(inner, 8)

    const inFlight = Array.from({ length: 8 }, () => hasher.hash("senha"))
    expect(inner.hash).toHaveBeenCalledTimes(8)

    const error = await hasher
      .hash("senha")
      .then(() => null)
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(PasswordHashingSaturatedError)
    expect(error).toMatchObject({ status: 503, retryAfterSeconds: 2 })
    expect(inner.hash).toHaveBeenCalledTimes(8)
    expect(inFlight).toHaveLength(8)
  })

  it("verify passa pelo mesmo gate que hash (o verify dummy também)", async () => {
    const { inner } = pendingHasher()
    const hasher = new BoundedPasswordHasher(inner, 2)

    void hasher.hash("senha")
    void hasher.verify("senha", "hash-real")

    await expect(hasher.verify("senha", "hash-dummy")).rejects.toBeInstanceOf(
      PasswordHashingSaturatedError,
    )
    expect(inner.verify).toHaveBeenCalledTimes(1)
  })

  it("vaga liberada deixa a próxima chamada passar", async () => {
    const { inner, pending } = pendingHasher()
    const hasher = new BoundedPasswordHasher(inner, 1)

    const first = hasher.hash("senha")
    await expect(hasher.hash("outra")).rejects.toBeInstanceOf(
      PasswordHashingSaturatedError,
    )

    pending[0]?.("hash-1" as never)
    await expect(first).resolves.toBe("hash-1")

    pending.length = 0
    const second = hasher.hash("outra")
    pending[0]?.("hash-2" as never)
    await expect(second).resolves.toBe("hash-2")
    expect(inner.hash).toHaveBeenCalledTimes(2)
  })

  it("a vaga volta mesmo quando o hasher interno lança", async () => {
    const inner: PasswordHasher = {
      hash: jest.fn().mockRejectedValue(new Error("argon2 explodiu")),
      verify: jest.fn().mockResolvedValue(true),
      needsRehash: () => false,
    }
    const hasher = new BoundedPasswordHasher(inner, 1)

    await expect(hasher.hash("senha")).rejects.toThrow("argon2 explodiu")
    // Sem o finally, a única vaga ficaria presa e esta chamada seria 503.
    await expect(hasher.verify("senha", "h")).resolves.toBe(true)
  })

  it("needsRehash não consome vaga (é puro, não toca o pool)", () => {
    const { inner } = pendingHasher()
    inner.needsRehash.mockReturnValue(true)
    const hasher = new BoundedPasswordHasher(inner, 1)

    void hasher.hash("senha")

    expect(hasher.needsRehash("hash-antigo")).toBe(true)
    expect(inner.needsRehash).toHaveBeenCalledWith("hash-antigo")
  })
})
