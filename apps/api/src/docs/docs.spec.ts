import { shouldMountDocs } from "./docs"

describe("shouldMountDocs", () => {
  it("produção sem DOCS_ENABLED → não monta", () => {
    expect(
      shouldMountDocs({ NODE_ENV: "production", DOCS_ENABLED: false })
    ).toBe(false)
  })

  it("produção com DOCS_ENABLED=true → monta", () => {
    expect(
      shouldMountDocs({ NODE_ENV: "production", DOCS_ENABLED: true })
    ).toBe(true)
  })

  it("não-produção sem DOCS_ENABLED → monta", () => {
    expect(
      shouldMountDocs({ NODE_ENV: "development", DOCS_ENABLED: false })
    ).toBe(true)
  })

  it("não-produção com DOCS_ENABLED=true → monta", () => {
    expect(
      shouldMountDocs({ NODE_ENV: "development", DOCS_ENABLED: true })
    ).toBe(true)
  })
})
