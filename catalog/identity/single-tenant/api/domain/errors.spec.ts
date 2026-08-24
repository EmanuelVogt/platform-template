import { describe, expect, it } from "vitest"

import { DomainError } from "../../../shared/kernel/errors/domain.error"

import {
  InvalidCredentialsError,
  WeakPasswordError,
  InvalidResetTokenError,
  SessionNotFoundError,
  RateLimitedError,
  PasswordHashingSaturatedError,
  BreachCheckUnavailableError,
  PermissionGrantNotAllowedError,
} from "./errors"

describe("errors de domínio identity", () => {
  it("todos os erros estendem DomainError", () => {
    const errors = [
      new InvalidCredentialsError(),
      new WeakPasswordError(),
      new InvalidResetTokenError(),
      new SessionNotFoundError(),
      new RateLimitedError(30),
      new PasswordHashingSaturatedError(),
      new BreachCheckUnavailableError(),
      new PermissionGrantNotAllowedError(),
    ]
    for (const err of errors) {
      expect(err).toBeInstanceOf(DomainError)
      expect(err).toBeInstanceOf(Error)
    }
  })

  it("InvalidCredentialsError: status 401, type estável, título pt-BR", () => {
    const err = new InvalidCredentialsError()
    expect(err.status).toBe(401)
    expect(err.type).toBe(
      "https://errors.example.com/identity/invalid-credentials"
    )
    expect(err.title).toBe("Credenciais inválidas")
  })

  it("InvalidCredentialsError é UMA classe estável em todos os caminhos (anti-enumeração)", () => {
    const userMissing = new InvalidCredentialsError()
    const wrongPass = new InvalidCredentialsError()
    const locked = new InvalidCredentialsError()
    for (const err of [userMissing, wrongPass, locked]) {
      expect(err.type).toBe(
        "https://errors.example.com/identity/invalid-credentials"
      )
      expect(err.status).toBe(401)
      expect(err.message).toBe("Credenciais inválidas")
    }
  })

  it("WeakPasswordError: status 422", () => {
    const err = new WeakPasswordError()
    expect(err.status).toBe(422)
    expect(err.type).toBe("https://errors.example.com/identity/weak-password")
    expect(err.title).toBe("Senha fraca")
  })

  it("InvalidResetTokenError: status 400", () => {
    const err = new InvalidResetTokenError()
    expect(err.status).toBe(400)
    expect(err.type).toBe(
      "https://errors.example.com/identity/invalid-reset-token"
    )
  })

  it("SessionNotFoundError: status 404", () => {
    const err = new SessionNotFoundError()
    expect(err.status).toBe(404)
    expect(err.type).toBe(
      "https://errors.example.com/identity/session-not-found"
    )
  })

  it("RateLimitedError: status 429 e carrega retryAfterSeconds", () => {
    const err = new RateLimitedError(45)
    expect(err.status).toBe(429)
    expect(err.type).toBe("https://errors.example.com/identity/rate-limited")
    expect(err.retryAfterSeconds).toBe(45)
  })

  it("PasswordHashingSaturatedError: status 503, type estável, Retry-After 2s", () => {
    const err = new PasswordHashingSaturatedError()
    expect(err.status).toBe(503)
    expect(err.type).toBe(
      "https://errors.example.com/identity/password-hashing-saturated"
    )
    expect(err.retryAfterSeconds).toBe(2)
    expect(err.title).toBe("Serviço temporariamente indisponível")
  })

  it("BreachCheckUnavailableError: status 503, type estável, Retry-After 5s", () => {
    const err = new BreachCheckUnavailableError()
    expect(err.status).toBe(503)
    expect(err.type).toBe(
      "https://errors.example.com/identity/breach-check-unavailable"
    )
    expect(err.retryAfterSeconds).toBe(5)
  })

  it("BreachCheckUnavailableError nunca se confunde com senha vazada", () => {
    expect(new BreachCheckUnavailableError().type).not.toBe(
      new WeakPasswordError().type
    )
  })

  it("PermissionGrantNotAllowedError: status 403, type permission-grant-not-allowed", () => {
    const err = new PermissionGrantNotAllowedError()
    expect(err.status).toBe(403)
    expect(err.type).toBe(
      "https://errors.example.com/identity/permission-grant-not-allowed"
    )
    expect(err.retryAfterSeconds).toBeUndefined()
  })

  it("os três types novos são únicos entre si e distintos dos existentes", () => {
    const types = [
      new PasswordHashingSaturatedError().type,
      new BreachCheckUnavailableError().type,
      new PermissionGrantNotAllowedError().type,
      new RateLimitedError(1).type,
      new InvalidCredentialsError().type,
    ]
    expect(new Set(types).size).toBe(types.length)
  })
})
