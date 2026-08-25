import { createHash } from "node:crypto"
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Quantas tentativas de reivindicação antes de desistir, e o intervalo entre
 * elas. Cobrem a janela em que um worker já terminou seu arquivo mas ainda não
 * saiu — o runner libera o slot antes de o processo morrer.
 */
const CLAIM_ATTEMPTS = 40
const CLAIM_INTERVAL_MS = 50

let claimedIndex: number | null = null

/**
 * Índice do banco de worker deste processo — `test_w<índice>`, clonado pelo
 * `globalSetup`. Reivindicado num diretório de locks, NUNCA derivado de
 * `VITEST_POOL_ID`.
 *
 * O pool id não é único entre workers vivos. O runner mantém uma única
 * free-list de ids `1..maxWorkers` para o run inteiro e a reconstrói a cada
 * fronteira de `sequence.groupOrder`, enquanto cada tarefa devolve o seu id
 * depois, sem sincronizar com essa reconstrução — um id devolvido tarde marca
 * como livre um slot que um worker vivo do grupo novo já ocupa, e a partir
 * daí o runner entrega o mesmo slot a cada tarefa seguinte. No run mesclado do
 * `test:coverage` (`web` -> `api`+`api-int` -> `api-e2e`) dois int-specs
 * caíam assim no mesmo `test_wN` e truncavam as linhas um do outro; medido:
 * com `--project api --project api-int`, sem grupo anterior, o id nunca se
 * repete.
 *
 * `open(..., "wx")` é atômico no POSIX: dois processos podem tentar o mesmo
 * slot, só um cria o arquivo.
 */
export function claimWorkerDatabaseIndex(
  runKey: string,
  workerCount: number
): number {
  if (claimedIndex !== null) return claimedIndex
  const directory = lockDirectory(runKey)
  mkdirSync(directory, { recursive: true })

  const hint = poolIdHint()
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    for (let step = 0; step < workerCount; step += 1) {
      const index = ((hint - 1 + step) % workerCount) + 1
      if (claim(join(directory, `w${index}.lock`))) {
        claimedIndex = index
        return index
      }
    }
    waitMs(CLAIM_INTERVAL_MS)
  }

  throw new Error(
    `Nenhum dos ${workerCount} bancos de worker está livre depois de ${(CLAIM_ATTEMPTS * CLAIM_INTERVAL_MS) / 1000}s. ` +
      "Cada worker vivo do tier de integração precisa de um clone só seu — suba TEST_DB_WORKERS junto com o maxWorkers do tier."
  )
}

/**
 * Quantos clones o tier pode usar. Vem do config do projeto (`env` de
 * `vitest.int.config.mts`), que declara o mesmo número do `maxWorkers` —
 * ler errado aqui significaria dois workers no mesmo banco, então falta ou
 * valor inválido é erro, não default.
 */
export function workerDatabaseCount(): number {
  const declared = Number(process.env.TEST_DB_WORKERS)
  if (!Number.isInteger(declared) || declared < 1) {
    throw new Error(
      "TEST_DB_WORKERS ausente ou inválido: o tier de integração roda pelo config que o declara (vitest.int.config.mts)."
    )
  }
  return declared
}

/** Diretório de locks deste run: a URI do container tem porta efêmera própria. */
export function lockDirectory(runKey: string): string {
  const digest = createHash("sha256").update(runKey).digest("hex").slice(0, 16)
  return join(tmpdir(), `platform-test-db-${digest}`)
}

/** Slot preferido: com a free-list sã cada worker fica no seu, sem disputa. */
function poolIdHint(): number {
  const poolId = Number(process.env.VITEST_POOL_ID)
  return Number.isInteger(poolId) && poolId > 0 ? poolId : 1
}

function claim(path: string): boolean {
  if (write(path)) {
    registerRelease(path)
    return true
  }
  // Lock de processo morto (worker derrubado sem rodar o `exit`) não protege
  // ninguém: quem morreu não usa mais o banco.
  if (holderIsAlive(path)) return false
  return steal(path)
}

function write(path: string): boolean {
  try {
    const handle = openSync(path, "wx")
    try {
      writeSync(handle, String(process.pid))
    } finally {
      closeSync(handle)
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
    throw error
  }
}

function holderIsAlive(path: string): boolean {
  let holder: number
  try {
    holder = Number(readFileSync(path, "utf8"))
  } catch {
    // Sumiu entre o open e a leitura: quem o tinha já liberou.
    return false
  }
  if (!Number.isInteger(holder) || holder < 1) return false
  try {
    // Sinal 0 não entrega nada: só pergunta se o processo existe.
    process.kill(holder, 0)
    return true
  } catch {
    return false
  }
}

function steal(path: string): boolean {
  try {
    unlinkSync(path)
  } catch {
    // Outro worker roubou primeiro; a varredura tenta o próximo slot.
    return false
  }
  if (!write(path)) return false
  // Dois processos podem ter roubado o mesmo slot na mesma janela: continua
  // só quem lê o próprio pid de volta.
  if (readFileSync(path, "utf8") !== String(process.pid)) return false
  registerRelease(path)
  return true
}

function registerRelease(path: string): void {
  process.once("exit", () => {
    try {
      unlinkSync(path)
    } catch {
      // Diretório já recolhido no fim do run.
    }
  })
}

/**
 * Espera bloqueante: a reivindicação acontece dentro de `testDatabaseUrl()`,
 * que é síncrona e é chamada de dezenas de specs — torná-la assíncrona
 * mudaria a assinatura de todo o tier.
 */
function waitMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
