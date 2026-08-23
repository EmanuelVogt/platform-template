import { useQueryClient } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { queryClient } from "@/_app/config/query-client"

import { AppProviders } from "./app-providers"

function Probe() {
  const client = useQueryClient()
  return <div>{client === queryClient ? "same-client" : "different-client"}</div>
}

describe("AppProviders", () => {
  it("renderiza os children sob o QueryClientProvider compartilhado", () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>
    )
    expect(screen.getByText("same-client")).toBeInTheDocument()
  })
})
