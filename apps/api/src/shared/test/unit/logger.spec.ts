import { describe, expect, it } from "vitest"

import { fakeLogger } from "./logger"
import { fakeRequestContext } from "./request-context"

describe("fakeLogger", () => {
  it("captura a linha emitida com nível, mensagem e bindings", () => {
    const { logger, lines } = fakeLogger()

    logger.info("subiu", { extra: 1 })

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ msg: "subiu", extra: 1, scope: "test" })
  })

  it("não escreve em stdout — a linha só existe no array", () => {
    const { logger, lines } = fakeLogger()

    logger.error("falhou")

    expect(lines.map((line) => line.msg)).toEqual(["falhou"])
  })

  it("dentro de um escopo a linha carrega a correlação do contexto", () => {
    const { ctx, logger, lines } = fakeLogger()

    ctx.run(fakeRequestContext({ requestId: "r9" }), () => {
      logger.warn("com contexto")
    })

    expect(lines[0]).toMatchObject({ requestId: "r9", correlationId: "c1" })
  })

  it("a fábrica nomeia o escopo pedido", () => {
    const { loggerFactory, lines } = fakeLogger()

    loggerFactory.forModule("outro").info("oi")

    expect(lines[0]).toMatchObject({ scope: "outro" })
  })
})
