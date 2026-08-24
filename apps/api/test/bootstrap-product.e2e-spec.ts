import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createApp } from "../src/main"

import type * as DocsModule from "../src/docs/docs"
import type {
  CallHandler,
  ExecutionContext,
  INestApplication,
  NestInterceptor,
} from "@nestjs/common"
import type { Observable } from "rxjs"

/**
 * Captura `req.rawBody` de uma rota já reconhecida (`/health`) via
 * interceptor global — evita a ordem Express entre body-parser (registrado só
 * dentro de `app.init()`) e o router do Nest (que responde 404 fechado para
 * qualquer path que ele não conheça, inclusive um registrado depois do init).
 */
class RawBodyProbeInterceptor implements NestInterceptor {
  captured: Buffer | undefined

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>
  ): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ rawBody?: Buffer }>()
    this.captured = req.rawBody
    return next.handle()
  }
}

const { order } = vi.hoisted(() => ({ order: [] as string[] }))

vi.mock("../src/bootstrap.product", () => ({
  bootstrapProduct: async () => {
    order.push("bootstrapProduct")
  },
}))

// Substitui o mount real (pacote ESM do Scalar) por um registro de ordem — o
// que este spec mede é a posição no boot, não a UI de docs em si.
vi.mock("../src/docs/docs", async (importOriginal) => {
  const actual = await importOriginal<typeof DocsModule>()
  return {
    ...actual,
    mountDocs: async () => {
      order.push("mountDocs")
    },
  }
})

describe("bootstrap.product (e2e)", () => {
  let app: INestApplication | undefined

  beforeEach(() => {
    order.length = 0
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it("rawBody: true entrega o corpo cru no request, antes do parse do body", async () => {
    app = await createApp()
    const probe = new RawBodyProbeInterceptor()
    app.useGlobalInterceptors(probe)
    await app.init()

    await request(app.getHttpServer())
      .get("/health")
      .set("Content-Type", "application/json")
      .send({ a: 1 })

    expect(probe.captured).toBeInstanceOf(Buffer)
    expect(probe.captured?.toString()).toBe(JSON.stringify({ a: 1 }))
  })

  it("o seam do produto roda depois de mountDocs", async () => {
    app = await createApp()
    expect(order).toEqual(["mountDocs", "bootstrapProduct"])
  })

  it("createApp só resolve depois que o seam do produto termina — logo, sempre antes de listen", async () => {
    app = await createApp()
    expect(order.at(-1)).toBe("bootstrapProduct")
  })
})
