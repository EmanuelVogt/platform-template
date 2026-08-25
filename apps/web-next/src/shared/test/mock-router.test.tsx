// eslint-disable-next-line import-x/order -- deve vir antes de next/navigation: o vi.mock hoisted de mock-router.tsx só intercepta imports resolvidos depois dele (ver o JSDoc lá)
import { mockRouter } from "./mock-router"

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { usePathname, useRouter } from "next/navigation"
import { describe, expect, it } from "vitest"

import { ROUTES } from "@/shared/config/routes"

function Probe() {
  const pathname = usePathname()
  const router = useRouter()
  return (
    <div>
      <span>{pathname}</span>
      <button
        onClick={() => {
          router.push(ROUTES.HOME)
        }}
      >
        ir
      </button>
    </div>
  )
}

describe("mockRouter", () => {
  it("expõe o pathname configurado", () => {
    mockRouter({ pathname: ROUTES.INICIO })

    render(<Probe />)

    expect(screen.getByText(ROUTES.INICIO)).toBeInTheDocument()
  })

  it("captura a chamada de push feita pelo componente", async () => {
    const router = mockRouter()

    render(<Probe />)
    await userEvent.click(screen.getByRole("button", { name: "ir" }))

    expect(router.navigate).toHaveBeenCalledWith(ROUTES.HOME)
  })
})
