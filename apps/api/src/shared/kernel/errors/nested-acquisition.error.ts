const INTERNAL_FRAMES = [
  "node_modules",
  "shared/infra/database",
  "shared/kernel/transactional",
]

/**
 * Primeiro frame do stack fora da infra de banco e do kernel transacional —
 * quem de fato pediu a conexão. Só para log e mensagem interna; nunca vai para
 * a resposta HTTP. As duas primeiras linhas são o cabeçalho "Error" e o frame
 * desta própria função, sempre descartadas.
 */
export function describeCaller(): string {
  const frames = (new Error().stack ?? "").split("\n").slice(2)
  const frame = frames.find(
    (line) => !INTERNAL_FRAMES.some((internal) => line.includes(internal))
  )
  if (!frame) return "chamador desconhecido"
  return frame.trim().replace(/^at\s+/, "")
}

/**
 * Deliberadamente NÃO estende DomainError: precisa cair no ramo fallback do
 * ProblemDetailsFilter, que responde 500 genérico sem ecoar a `message`. O
 * frame do chamador fica no log `unhandled_exception`, nunca no corpo HTTP.
 */
export class NestedAcquisitionError extends Error {
  constructor(caller: string) {
    super(
      `Conexão fora da transação pedida por ${caller} com transação ativa. ` +
        "Grave na própria transação com getExecutor()/recordInTx, use " +
        "propagation requires_new (SAVEPOINT na mesma conexão) ou mova a " +
        "escrita para depois do COMMIT com onCommit."
    )
    this.name = "NestedAcquisitionError"
  }
}
