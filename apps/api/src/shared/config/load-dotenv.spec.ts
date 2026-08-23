import { loadDotenvForDev } from "./load-dotenv"

describe("loadDotenvForDev", () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    jest.restoreAllMocks()
  })

  it("não carrega arquivo em produção", () => {
    process.env.NODE_ENV = "production"
    const loadEnvFile = jest.spyOn(process, "loadEnvFile").mockImplementation(() => undefined)
    loadDotenvForDev()
    expect(loadEnvFile).not.toHaveBeenCalled()
  })

  it("tenta carregar .env fora de produção", () => {
    process.env.NODE_ENV = "test"
    const loadEnvFile = jest.spyOn(process, "loadEnvFile").mockImplementation(() => undefined)
    loadDotenvForDev()
    expect(loadEnvFile).toHaveBeenCalled()
  })

  it("ignora ausência de .env local", () => {
    process.env.NODE_ENV = "development"
    jest.spyOn(process, "loadEnvFile").mockImplementation(() => {
      throw new Error("ENOENT")
    })
    expect(() => {
      loadDotenvForDev()
    }).not.toThrow()
  })
})
