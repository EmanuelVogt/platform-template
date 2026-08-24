import type { INestApplication } from "@nestjs/common"

/**
 * Seam do produto: `main.ts` chama isto depois de `mountDocs` e antes de
 * `listen`. Ships como no-op — `_skip_if_exists` no copier faz o produto
 * sobrescrever este arquivo para plugar extensões de boot sem editar `main.ts`.
 */
export async function bootstrapProduct(_app: INestApplication): Promise<void> {
  // no-op — o kernel não decide o que o produto faz aqui.
}
