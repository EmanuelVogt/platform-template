import { DomainError } from "./domain.error"
import { TooManyRequestsError } from "./too-many-requests.error"

describe("TooManyRequestsError do kernel", () => {
  it("estende DomainError: status 429, type transversal, título pt-BR", () => {
    const err = new TooManyRequestsError(42)
    expect(err).toBeInstanceOf(DomainError)
    expect(err.status).toBe(429)
    expect(err.type).toBe("https://errors.example.com/too-many-requests")
    expect(err.title).toBe("Muitas requisições")
  })

  it("carrega retryAfterSeconds do construtor", () => {
    expect(new TooManyRequestsError(42).retryAfterSeconds).toBe(42)
    expect(new TooManyRequestsError(0).retryAfterSeconds).toBe(0)
  })

  it("satisfaz o contrato que o ProblemDetailsFilter lê para o Retry-After", () => {
    // problem-details.filter.ts:118-138 só emite Retry-After quando a exceção
    // é DomainError E `retryAfterSeconds` é number E o status é 429 ou 503.
    const err = new TooManyRequestsError(7)
    const readByFilter =
      err instanceof DomainError && typeof err.retryAfterSeconds === "number"
        ? err.retryAfterSeconds
        : 60
    expect(readByFilter).toBe(7)
    expect([429, 503]).toContain(err.status)
  })

  it("expõe os membros que o toProblem copia para o corpo RFC 7807", () => {
    const err = new TooManyRequestsError(1)
    expect({
      type: err.type,
      title: err.title,
      status: err.status,
      detail: err.message,
    }).toEqual({
      type: "https://errors.example.com/too-many-requests",
      title: "Muitas requisições",
      status: 429,
      detail: "Muitas requisições",
    })
    expect(err.extensions).toBeUndefined()
  })
})
