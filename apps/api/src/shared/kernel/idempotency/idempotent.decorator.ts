import { applyDecorators, SetMetadata } from "@nestjs/common"
import { ApiHeader } from "@nestjs/swagger"

export const IDEMPOTENT_METADATA = "kernel:idempotent"

export type IdempotentOptions = {
  ttlHours: number
}

/**
 * Marca rota mutável com efeito externo como idempotente.
 *
 * Header `Idempotency-Key` é opcional (modelo Stripe): presente → dedup com
 * replay da resposta original por `ttlHours`; ausente → request segue sem
 * proteção, duplicação fica a cargo de constraint de domínio (ex.: email
 * UNIQUE, token one-time). Também declara o header no OpenAPI — runtime e
 * documentação saem do mesmo decorator e não dessincronizam.
 */
export function Idempotent(opts: IdempotentOptions): MethodDecorator {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_METADATA, opts),
    ApiHeader({
      name: "Idempotency-Key",
      required: false,
      description:
        `Chave única gerada pelo cliente por tentativa (ex.: UUID v4). ` +
        `Reenviar a mesma chave com o mesmo payload devolve a resposta ` +
        `original (replay) por até ${opts.ttlHours}h, sem repetir o efeito — ` +
        `seguro pra retry após timeout. Mesma chave com payload diferente ` +
        `retorna 422. Sem o header, o request executa normalmente, sem dedup.`,
      schema: { type: "string", maxLength: 200 },
    })
  )
}
