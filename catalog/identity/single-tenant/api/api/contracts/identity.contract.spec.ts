import { describe, expect, it } from "vitest"

import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  createUserSchema,
  updateUserSchema,
  idParamSchema,
  IdParamDto,
  LoginDto,
} from "./identity.contract"

const rep = (char: string, times: number): string => char.repeat(times)
const emailOf = (localLength: number): string =>
  `${rep("a", localLength)}@example.com`

const CREATE_USER_BASE = {
  name: "Ana",
  email: "ana@example.com",
  accessProfile: "admin" as const,
  permissions: ["admin.users.read"],
}

describe("identity.contract", () => {
  it("loginSchema tem rememberMe default true", () => {
    const out = loginSchema.parse({
      email: "a@b.com",
      password: "p",
    })
    expect(out.rememberMe).toBe(true)
  })

  it("forgotPasswordSchema exige email", () => {
    expect(() => forgotPasswordSchema.parse({})).toThrow()
  })

  it("resetPasswordSchema exige token e password", () => {
    const out = resetPasswordSchema.parse({ token: "t", password: "p" })
    expect(out.token).toBe("t")
  })

  it("changePasswordSchema exige currentPassword e newPassword", () => {
    expect(() =>
      changePasswordSchema.parse({ currentPassword: "a" }),
    ).toThrow()
  })

  it("verifyEmailSchema exige token", () => {
    expect(() => verifyEmailSchema.parse({})).toThrow()
  })

  it("DTOs expõem o schema (createZodDto)", () => {
    expect(LoginDto).toBeDefined()
  })

  it("email aceita 254 caracteres e recusa 255", () => {
    const atLimit = emailOf(254 - "@example.com".length)
    expect(loginSchema.parse({ email: atLimit, password: "p" }).email).toBe(
      atLimit,
    )
    expect(() =>
      loginSchema.parse({ email: emailOf(255 - "@example.com".length), password: "p" }),
    ).toThrow()
    expect(() =>
      forgotPasswordSchema.parse({ email: emailOf(255 - "@example.com".length) }),
    ).toThrow()
  })

  it("token aceita 128 caracteres e recusa 129", () => {
    expect(
      resetPasswordSchema.parse({ token: rep("t", 128), password: "p" }).token,
    ).toHaveLength(128)
    expect(() =>
      resetPasswordSchema.parse({ token: rep("t", 129), password: "p" }),
    ).toThrow()
    expect(() => verifyEmailSchema.parse({ token: rep("t", 129) })).toThrow()
  })

  it("name aceita 200 caracteres e recusa 201", () => {
    expect(
      createUserSchema.parse({ ...CREATE_USER_BASE, name: rep("n", 200) }).name,
    ).toHaveLength(200)
    expect(() =>
      createUserSchema.parse({ ...CREATE_USER_BASE, name: rep("n", 201) }),
    ).toThrow()
    expect(() =>
      updateUserSchema.parse({
        name: rep("n", 201),
        accessProfile: "admin",
        permissions: [],
      }),
    ).toThrow()
  })

  it("permissions duplicadas são recusadas", () => {
    expect(() =>
      createUserSchema.parse({
        ...CREATE_USER_BASE,
        permissions: ["admin.users.read", "admin.users.read"],
      }),
    ).toThrow()
  })

  it("areaIds, serviceIds e schedulingAreaIds duplicados são recusados", () => {
    expect(() =>
      createUserSchema.parse({ ...CREATE_USER_BASE, areaIds: ["a", "a"] }),
    ).toThrow()
    expect(() =>
      createUserSchema.parse({ ...CREATE_USER_BASE, serviceIds: ["s", "s"] }),
    ).toThrow()
    expect(() =>
      createUserSchema.parse({
        ...CREATE_USER_BASE,
        schedulingAreaIds: ["a", "a"],
      }),
    ).toThrow()
  })

  it("listas sem repetição continuam válidas", () => {
    const out = createUserSchema.parse({
      ...CREATE_USER_BASE,
      areaIds: ["a-1", "a-2"],
      serviceIds: ["s-1", "s-2"],
      schedulingAreaIds: ["a-1", "a-3"],
    })
    expect(out.areaIds).toEqual(["a-1", "a-2"])
  })

  it("idParamSchema exige id de 1 a 64 caracteres", () => {
    expect(idParamSchema.parse({ id: rep("x", 64) }).id).toHaveLength(64)
    expect(() => idParamSchema.parse({ id: "" })).toThrow()
    expect(() => idParamSchema.parse({ id: rep("x", 65) })).toThrow()
    expect(IdParamDto).toBeDefined()
  })
})
