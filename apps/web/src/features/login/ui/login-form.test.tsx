import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderWithProviders } from "@/shared/test/render-with-providers"

import { LoginForm } from "./login-form"

const loginState = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
}

vi.mock("../model/use-login", () => ({
  useLogin: () => loginState,
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}))

describe("LoginForm", () => {
  beforeEach(() => {
    loginState.mutate = vi.fn()
    loginState.isPending = false
    loginState.isError = false
  })

  it("renderiza os campos e-mail, senha, checkbox e botão de submit", () => {
    renderWithProviders(<LoginForm />)
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument()
    expect(screen.getByLabelText("Senha")).toBeInTheDocument()
    expect(screen.getByLabelText(/manter conectado/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument()
  })

  it("exibe mensagens de validação pt-BR ao submeter vazio", async () => {
    renderWithProviders(<LoginForm />)
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }))
    await waitFor(() => {
      expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument()
      expect(screen.getByText("Informe sua senha.")).toBeInTheDocument()
    })
    expect(loginState.mutate).not.toHaveBeenCalled()
  })

  it("exibe erro de e-mail inválido ao digitar texto sem @", async () => {
    renderWithProviders(<LoginForm />)
    await userEvent.type(screen.getByLabelText("E-mail"), "invalido")
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }))
    await waitFor(() => {
      expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument()
    })
    expect(loginState.mutate).not.toHaveBeenCalled()
  })

  it("preencher campos válidos e submeter chama mutate com payload correto", async () => {
    renderWithProviders(<LoginForm />)
    await userEvent.type(screen.getByLabelText("E-mail"), "dev@example.com")
    await userEvent.type(screen.getByLabelText("Senha"), "MinhaSenh@1")
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }))
    await waitFor(() => {
      expect(loginState.mutate).toHaveBeenCalledWith(
        {
          data: {
            email: "dev@example.com",
            password: "MinhaSenh@1",
            rememberMe: true,
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) })
      )
    })
  })

  it("estado pending desabilita o botão e exibe texto 'Entrando…'", () => {
    loginState.isPending = true
    renderWithProviders(<LoginForm />)
    expect(screen.getByRole("button", { name: "Entrando…" })).toBeDisabled()
  })

  it("erro da API exibe mensagem de erro inline", () => {
    loginState.isError = true
    renderWithProviders(<LoginForm />)
    expect(screen.getByText(/não foi possível entrar/i)).toBeInTheDocument()
  })
})
