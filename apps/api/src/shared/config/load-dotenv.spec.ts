import { loadDotenvForDev } from "./load-dotenv"

describe("loadDotenvForDev", () => {
  const originalEnv = process.env.NODE_ENV
  const loadEnvFile = process.loadEnvFile

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    process.loadEnvFile = loadEnvFile
  })

  it("não carrega arquivo em produção", () => {
    process.env.NODE_ENV = "production"
    process.loadEnvFile = jest.fn()
    loadDotenvForDev()
    expect(process.loadEnvFile).not.toHaveBeenCalled()
  })

  it("tenta carregar .env fora de produção", () => {
    process.env.NODE_ENV = "test"
    process.loadEnvFile = jest.fn()
    loadDotenvForDev()
    expect(process.loadEnvFile).toHaveBeenCalled()
  })

  it("ignora ausência de .env local", () => {
    process.env.NODE_ENV = "development"
    process.loadEnvFile = jest.fn(() => {
      throw new Error("ENOENT")
    })
    expect(() => loadDotenvForDev()).not.toThrow()
  })
})
