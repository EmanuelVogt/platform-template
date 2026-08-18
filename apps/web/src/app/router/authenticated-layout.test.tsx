import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/shared/config/routes"

import { AuthenticatedLayout } from "./authenticated-layout"

const { logoutMutate, navigate, session } = vi.hoisted(() => ({
  logoutMutate: vi.fn(),
  navigate: vi.fn(),
  session: { data: undefined as { user: { name: string } } | undefined },
}))

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div>conteúdo</div>,
  useNavigate: () => navigate,
}))

vi.mock("@/entities/session/api/session.queries", () => ({
  useSession: () => session,
  useLogout: () => ({ mutate: logoutMutate, isPending: false }),
}))

describe("AuthenticatedLayout", () => {
  beforeEach(() => {
    logoutMutate.mockReset()
    navigate.mockReset()
    session.data = { user: { name: "Ana" } }
  })

  it("exibe o nome do usuário da sessão e o conteúdo da rota filha", () => {
    render(<AuthenticatedLayout />)

    expect(screen.getByText("Ana")).toBeInTheDocument()
    expect(screen.getByText("conteúdo")).toBeInTheDocument()
  })

  it("ao sair, dispara o logout e navega para o login", async () => {
    logoutMutate.mockImplementation(
      (_variables: unknown, options: { onSuccess: () => void }) => {
        options.onSuccess()
      }
    )

    render(<AuthenticatedLayout />)

    await userEvent.click(screen.getByRole("button", { name: "Sair" }))

    expect(logoutMutate).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ to: ROUTES.LOGIN })
  })
})
