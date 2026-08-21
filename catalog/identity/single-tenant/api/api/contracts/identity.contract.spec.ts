import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  LoginDto,
} from "./identity.contract"

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
})
