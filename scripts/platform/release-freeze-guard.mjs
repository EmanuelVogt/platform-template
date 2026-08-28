import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { isMain } from "./lib/is-main.mjs"
import {
  decideFreeze,
  originTagExists,
  readLease,
  releaseLease,
  updateLease,
} from "./lib/release-lease.mjs"

function gitExec(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

// stdin do pre-push é o protocolo do git: uma linha por ref empurrada,
// "<local-ref> <local-sha> <remote-ref> <remote-sha>", terminando em EOF. Uma
// sessão interativa (isTTY) nunca fecha esse stream sozinha — tratamos como
// ausente em vez de bloquear a leitura.
function readStdin() {
  if (process.stdin.isTTY) return ""
  try {
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

export function parsePushLines(raw) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/)
      return { localRef, localSha, remoteRef, remoteSha }
    })
}

// stdin vazio (hook chamado fora do protocolo do git, ou lefthook sem
// use_stdin) cai para o fallback: o branch local é "main"? Só roda o `git
// rev-parse` quando falta essa informação — nunca no caminho comum.
function pushesMain({ pushLines, cwd }) {
  if (pushLines.length > 0) {
    return pushLines.some((line) => line.remoteRef === "refs/heads/main")
  }
  const branch = gitExec(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
  return branch.stdout.trim() === "main"
}

export function runFreezeGuard({
  cwd = process.cwd(),
  env = process.env,
  stdinRaw = readStdin(),
} = {}) {
  const pushLines = parsePushLines(stdinRaw)

  // Caminho comum: sem lease, nada a decidir. Nenhuma chamada de git além da
  // resolução do common-dir que já mora dentro de readLease.
  const { lease, corrupt } = readLease({ cwd })
  if (lease === undefined && !corrupt) return { exitCode: 0 }

  if (env.PLATFORM_RELEASE_FREEZE_BYPASS === "1") {
    process.stderr.write(
      "release-freeze-guard — PLATFORM_RELEASE_FREEZE_BYPASS=1: freeze de release ignorado\n"
    )
    return { exitCode: 0 }
  }

  const decision = decideFreeze({
    lease,
    corrupt,
    holderEnv: env,
    pushesMain: pushesMain({ pushLines, cwd }),
    tagExists: null,
    now: Date.now,
  })

  if (decision.action === "allow") return { exitCode: 0 }

  if (decision.action === "allow-upgrade") {
    // Otimista: é o próprio titular subindo o estágio antes de saber se o
    // `git push` vai dar certo. Se falhar, `pnpm platform release --status`
    // (evidência de tag) reconcilia o lease depois; um lease marker-pushed
    // otimista só bloqueia estranhos, então o custo de errar aqui é zero.
    updateLease({ cwd, patch: { stage: "marker-pushed" } })
    return { exitCode: 0 }
  }

  // decision.action === "block" — última chance de autolimpeza: se a tag da
  // versão já existe (local ou em origin), o release em questão terminou e o
  // lease é lixo deixado para trás. Nenhuma outra chamada de rede acontece
  // fora deste ramo — uma queda de rede nunca pode travar um push comum.
  if (lease?.version) {
    const localTag = gitExec(["tag", "-l", `v${lease.version}`], cwd)
    const clearedLocally = localTag.stdout.trim().length > 0
    const clearedRemotely =
      !clearedLocally &&
      originTagExists({ cwd, version: lease.version }) === true
    if (clearedLocally || clearedRemotely) {
      releaseLease({ cwd, force: true })
      return { exitCode: 0 }
    }
  }

  process.stderr.write(
    `release-freeze-guard — push para main bloqueado: ${decision.reason}\n`
  )
  return { exitCode: 1 }
}

if (isMain(import.meta.url, process.argv[1])) {
  const { exitCode } = runFreezeGuard()
  process.exit(exitCode)
}
