import { describe, expect, it } from "vitest"

import { can } from "./permissions"

import type { CurrentUser } from "./session.types"

function user(over: Partial<CurrentUser>): CurrentUser {
  return {
    id: "u1",
    name: "Ana",
    email: "ana@x.test",
    emailVerified: true,
    pendingEmail: null,
    accessProfile: "admin",
    permissions: [],
    avatarAttachmentId: null,
    birthDate: null,
    ...over,
  }
}

describe("can", () => {
  it("master sempre pode", () => {
    expect(can(user({ accessProfile: "master" }), "admin.users.read")).toBe(true)
  })

  it("chave no set → true; fora → false", () => {
    const u = user({ permissions: ["admin.users.read"] })
    expect(can(u, "admin.users.read")).toBe(true)
    expect(can(u, "admin.users.create")).toBe(false)
  })
})
