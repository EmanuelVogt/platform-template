import "@testing-library/jest-dom/vitest"

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

function Greeting({ name }: { name: string }) {
  return <p>Olá, {name}</p>
}

describe("harness de render (RTL + jsdom)", () => {
  it("renderiza um componente e consulta o DOM", () => {
    render(<Greeting name="Platform" />)
    expect(screen.getByText("Olá, Platform")).toBeInTheDocument()
  })
})
