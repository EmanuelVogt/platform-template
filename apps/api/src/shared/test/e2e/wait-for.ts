export type WaitForOptions = {
  timeoutMs?: number
  intervalMs?: number
  /** Aparece na mensagem do timeout — diga o que estava sendo esperado. */
  label?: string
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Único primitivo de espera dos testes: repete `fn` até devolver algo diferente
 * de `undefined`/`null`/`false` ou o prazo acabar. Um `setTimeout` solto como
 * prova de efeito assíncrono passa quando a máquina está lenta e mente quando
 * está rápida — aqui o fracasso é sempre um timeout nomeado.
 */
export async function waitFor<T>(
  fn: () => Promise<T | undefined> | T | undefined,
  opts: WaitForOptions = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5_000
  const intervalMs = opts.intervalMs ?? 25
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null
  do {
    try {
      const value = await fn()
      if (value !== undefined && value !== null && value !== false) return value
    } catch (err) {
      lastError = err
    }
    await sleep(intervalMs)
  } while (Date.now() < deadline)
  const label = opts.label ?? "condição"
  const cause =
    lastError instanceof Error ? ` — última falha: ${lastError.message}` : ""
  throw new Error(`waitFor: ${label} não ocorreu em ${timeoutMs}ms${cause}`)
}
