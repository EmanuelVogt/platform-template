import pino from "pino"

import { redactConfig, redactValue, SENSITIVE_FIELDS } from "./log.redact"

const FIELDS = ["email", "cpf", "phone", "password", "token", "creditCard"]

describe("redactConfig", () => {
  it("cobre cada PII no topo, em 1 e em 2 níveis", () => {
    for (const field of FIELDS) {
      expect(redactConfig.paths).toContain(field)
      expect(redactConfig.paths).toContain(`*.${field}`)
      expect(redactConfig.paths).toContain(`*.*.${field}`)
    }
  })

  it("cobre headers sensíveis e censura com [REDACTED]", () => {
    expect(redactConfig.paths).toContain("req.headers.authorization")
    expect(redactConfig.paths).toContain("req.headers.cookie")
    expect(redactConfig.censor).toBe("[REDACTED]")
  })

  it("redige de fato via pino no topo e aninhado", () => {
    const lines: string[] = []
    const logger = pino({ redact: redactConfig }, { write: (s) => lines.push(s) })

    logger.info(
      {
        email: "alice@example.com",
        user: { cpf: "12345678900" },
        deep: { nested: { token: "super-secret" } },
      },
      "evento"
    )

    const out = lines.join("")
    expect(out).not.toContain("alice@example.com")
    expect(out).not.toContain("12345678900")
    expect(out).not.toContain("super-secret")
    expect(out).toContain("[REDACTED]")
  })
})

describe("redactConfig — campos de auth", () => {
  it("censura ip, ip_address, user_agent e email_attempted no topo", () => {
    expect(redactConfig.paths).toEqual(
      expect.arrayContaining([
        "ip",
        "ip_address",
        "user_agent",
        "email_attempted",
      ])
    )
  })

  it("censura os mesmos campos a 1 nível", () => {
    expect(redactConfig.paths).toEqual(
      expect.arrayContaining(["*.ip", "*.email_attempted"])
    )
  })
})

describe("redactConfig — profundidade e headers de auth aninhados", () => {
  it("inclui authorization/cookie/set-cookie por nome em vários níveis", () => {
    for (const f of ["authorization", "cookie", "set-cookie"]) {
      expect(redactConfig.paths).toContain(f)
      expect(redactConfig.paths).toContain(`*.${f}`)
      expect(redactConfig.paths).toContain(`*.*.*.*.${f}`)
    }
  })

  it("redige authorization a 4 níveis (err de cliente HTTP)", () => {
    const lines: string[] = []
    const logger = pino({ redact: redactConfig }, { write: (s) => lines.push(s) })
    logger.error(
      {
        err: {
          response: { config: { headers: { authorization: "Bearer segredo-x" } } },
        },
      },
      "upstream falhou"
    )
    const out = lines.join("")
    expect(out).not.toContain("Bearer segredo-x")
    expect(out).toContain("[REDACTED]")
  })

  it("redige cookie aninhado em err.config.headers", () => {
    const lines: string[] = []
    const logger = pino({ redact: redactConfig }, { write: (s) => lines.push(s) })
    logger.error(
      { err: { config: { headers: { cookie: "session=abc123" } } } },
      "x"
    )
    expect(lines.join("")).not.toContain("session=abc123")
  })

  it("não redige além do cap de 5 níveis (limite consciente)", () => {
    const lines: string[] = []
    const logger = pino({ redact: redactConfig }, { write: (s) => lines.push(s) })
    // password a 6 níveis (a.b.c.d.e.f.password) — acima do cap.
    logger.error(
      { a: { b: { c: { d: { e: { f: { password: "fundo-do-poco" } } } } } } },
      "x"
    )
    expect(lines.join("")).toContain("fundo-do-poco")
  })
})

describe("redactValue (corpo de request/response no log)", () => {
  it("redige campo sensível no topo, preservando os demais", () => {
    expect(redactValue({ email: "a@b.com", id: 1 })).toEqual({
      email: "[REDACTED]",
      id: 1,
    })
  })

  it("redige link (token viaja na URL)", () => {
    expect(redactValue({ link: "https://x/configurar-senha?token=raw" })).toEqual({
      link: "[REDACTED]",
    })
  })

  it("redige em profundidade arbitrária", () => {
    const input = { a: { b: { c: { password: "secret", ok: "x" } } } }
    expect(redactValue(input)).toEqual({
      a: { b: { c: { password: "[REDACTED]", ok: "x" } } },
    })
  })

  it("redige campos sensíveis dentro de arrays", () => {
    const input = { items: [{ token: "t1" }, { token: "t2", n: 3 }] }
    expect(redactValue(input)).toEqual({
      items: [{ token: "[REDACTED]" }, { token: "[REDACTED]", n: 3 }],
    })
  })

  it("compara o nome da chave case-insensitive", () => {
    expect(redactValue({ Email: "x", USERAGENT: "y" })).toEqual({
      Email: "[REDACTED]",
      USERAGENT: "[REDACTED]",
    })
  })

  it("primitivos e null passam intactos", () => {
    expect(redactValue("plain")).toBe("plain")
    expect(redactValue(42)).toBe(42)
    expect(redactValue(null)).toBeNull()
  })

  it("não muta o objeto de entrada", () => {
    const input = { email: "a@b.com" }
    redactValue(input)
    expect(input.email).toBe("a@b.com")
  })

  it("reusa SENSITIVE_FIELDS (mesma lista do pino)", () => {
    expect(SENSITIVE_FIELDS).toEqual(expect.arrayContaining(["password", "token", "email"]))
  })
})
