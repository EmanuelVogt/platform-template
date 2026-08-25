// eslint-disable-next-line import-x/order -- deve vir antes de @tanstack/react-router: o vi.mock hoisted de mock-router.tsx só intercepta imports resolvidos depois dele (ver o JSDoc lá)
import { mockRouter } from "./mock-router"

import { Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { ROUTES } from "@/shared/config/routes"

function Probe() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <div>
      <span>{location.pathname}</span>
      <button onClick={() => navigate({ to: ROUTES.HOME })}>ir</button>
      <Outlet />
    </div>
  )
}

describe("mockRouter", () => {
  it("expõe o pathname e o outlet configurados", () => {
    mockRouter({ pathname: ROUTES.INICIO, outlet: <p>conteúdo filho</p> })

    render(<Probe />)

    expect(screen.getByText(ROUTES.INICIO)).toBeInTheDocument()
    expect(screen.getByText("conteúdo filho")).toBeInTheDocument()
  })

  it("captura a chamada de navigate feita pelo componente", async () => {
    const router = mockRouter()

    render(<Probe />)
    await userEvent.click(screen.getByRole("button", { name: "ir" }))

    expect(router.navigate).toHaveBeenCalledWith({ to: ROUTES.HOME })
  })
})
