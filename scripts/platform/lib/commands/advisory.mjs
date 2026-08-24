import { spawnSync } from "node:child_process"
import path from "node:path"
import { loadAdvisories } from "../advisories.mjs"
import { EXIT_CODES } from "../exit-codes.mjs"

// `status` cru do processo, não coalescido: ENOENT/binário ausente chega como
// `null`, nunca virando 0 ("não afetado") por trás do chamador.
function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

// Aspas simples/duplas viram um único token sem as aspas — necessário para os `detect` que
// passam um padrão de regex a `rg` (ex.: `rg -l 'jest\.' <path>`).
function tokenizeDetectCommand(command) {
  const tokens = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match
  while ((match = pattern.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3])
  }
  return tokens
}

// Um `detect` com `;` encadeia mais de um comando (ex.: duas sondas `rg` distintas) — só um
// shell de verdade entende isso; o caminho simples preserva `[command, args]` separados.
function runDetect(run, detect, cwd) {
  if (detect.includes(";")) {
    return run("sh", ["-c", detect], { cwd })
  }
  const [command, ...args] = tokenizeDetectCommand(detect)
  return run(command, args, { cwd })
}

export async function detectCommand({
  id,
  cwd = process.cwd(),
  run = defaultRun,
  advisoriesDir,
}) {
  const dir = advisoriesDir ?? path.join(cwd, "docs/advisories")
  const advisories = loadAdvisories(dir)
  const advisory = advisories.find((entry) => entry.id === id)
  if (!advisory) {
    process.stderr.write(`advisory não encontrado: ${id}\n`)
    return EXIT_CODES.ADVISORY_INVALID
  }

  const result = runDetect(run, advisory.detect, cwd)
  if (result.status === 1) {
    process.stdout.write(`${id}: afetado\n`)
    return 1
  }
  if (result.status === 0) {
    process.stdout.write(`${id}: não afetado\n`)
    return EXIT_CODES.OK
  }
  process.stderr.write(
    `${id}: detecção falhou (status ${result.status ?? "indisponível"}) — não é possível afirmar se o child está afetado\n`
  )
  return EXIT_CODES.ADVISORY_DETECT_FAILED
}
