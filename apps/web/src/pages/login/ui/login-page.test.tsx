import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { renderWithProviders } from "@/shared/test/render-with-providers"

import { LoginPage } from "./login-page"

const mockNavigate = vi.fn()
const mockMutate = vi.fn()

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock("@/features/login/model/use-login", () => ({
  useLogin: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
  }),
}))

describe("LoginPage", () => {
  it("renderiza o formulário de login com os elementos principais", () => {
    renderWithProviders(<LoginPage />)

    expect(screen.getByText("Entrar na conta")).toBeInTheDocument()
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument()
    expect(screen.getByLabelText("Senha")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument()
  })

  it("submete o formulário ao clicar em Entrar", async () => {
    renderWithProviders(<LoginPage />)

    await userEvent.type(screen.getByLabelText("E-mail"), "dev@example.com")
    await userEvent.type(screen.getByLabelText("Senha"), "Senha@123")
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }))

    expect(mockMutate).toHaveBeenCalledWith(
      {
        data: {
          email: "dev@example.com",
          password: "Senha@123",
          rememberMe: true,
        },
      },
      expect.any(Object)
    )
  })
})
