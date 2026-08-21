import { loadDotenvForDev } from "./load-dotenv"

const spyLoadEnvFile = () => jest.spyOn(process, "loadEnvFile").mockImplementation(() => undefined)

describe("loadDotenvForDev", () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    jest.restoreAllMocks()
  })

  it("não carrega arquivo em produção", () => {
    process.env.NODE_ENV = "production"
    const loadEnvFile = spyLoadEnvFile()
    loadDotenvForDev()
    expect(loadEnvFile).not.toHaveBeenCalled()
  })

  it("tenta carregar .env fora de produção", () => {
    process.env.NODE_ENV = "test"
    const loadEnvFile = spyLoadEnvFile()
    loadDotenvForDev()
    expect(loadEnvFile).toHaveBeenCalled()
  })

  it("ignora ausência de .env local", () => {
    process.env.NODE_ENV = "development"
    spyLoadEnvFile().mockImplementation(() => {
      throw new Error("ENOENT")
    })
    expect(() => {
      loadDotenvForDev()
    }).not.toThrow()
  })
})
