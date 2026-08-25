import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { server } from "./msw-server"
import { useMswServer } from "./use-msw-server"

const BASE_URL = "http://localhost:9999"

describe("useMswServer", () => {
  useMswServer(
    http.get(`${BASE_URL}/echo`, () => HttpResponse.json({ from: "base" }))
  )

  it("sobrescreve o handler base dentro de um teste com server.use", async () => {
    server.use(
      http.get(`${BASE_URL}/echo`, () =>
        HttpResponse.json({ from: "override" })
      )
    )

    const res = await fetch(`${BASE_URL}/echo`)
    await expect(res.json()).resolves.toEqual({ from: "override" })
  })

  it("reseta para o handler base no teste seguinte, sem herdar o override", async () => {
    const res = await fetch(`${BASE_URL}/echo`)
    await expect(res.json()).resolves.toEqual({ from: "base" })
  })
})
