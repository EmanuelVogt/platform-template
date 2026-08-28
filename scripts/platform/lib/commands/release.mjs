import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { runPreflight as runReleasePreflight } from "../../release-preflight.mjs"
import { EXIT_CODES } from "../exit-codes.mjs"
import { readLatestChangelogVersion } from "../kernel-version.mjs"
import * as defaultLease from "../release-lease.mjs"
import { isMarkerSubject, parseMarkerSubject } from "../release-marker.mjs"

// `parseArgs` aceita qualquer `--x` em silêncio, então sem esta lista uma flag
// desconhecida cai no caminho default e corta uma release: foi assim que o
// marcador da v2.3.0 nasceu, de um `release --help`.
export const RELEASE_FLAGS = Object.freeze(["push", "help"])

export const RELEASE_USAGE = [
  "uso: pnpm platform release [versão] [--push]",
  "",
  "  versão   x.y.z; sem argumento, usa a última seção do changelog",
  "  --push   empurra o marcador para main (o push é o gatilho do release.yml)",
  "",
  "Cria um commit vazio `chore(release): vX.Y.Z` e nunca cria tags: a tag é",
  "sempre ato do release.yml.",
].join("\n")

export function unknownReleaseFlags(options = {}) {
  return Object.keys(options).filter((flag) => !RELEASE_FLAGS.includes(flag))
}

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

function defaultLog(line) {
  process.stdout.write(`${line}\n`)
}

const STATUS_CMD = "`pnpm platform release --status`"
const ABORT_CMD = "`pnpm platform release --abort`"

// MARK-13: os checks abaixo rodam antes de qualquer outra coisa — nenhum commit
// pode existir quando o comando se recusa a rodar.
function refusalReason({ branch, statusOutput, isTemplate }) {
  // O CLI da plataforma vai para o produto gerado, e este subcomando vai junto
  // (o `cli.mjs` o importa estaticamente, então excluí-lo quebraria o import).
  // `catalog/` só existe no template — mesma sonda do job `detect` do ci.yml.
  // Sem esta guarda, `--push` num produto empurraria a main, que lá é deploy.
  if (!isTemplate) {
    return "release — comando exclusivo do template (não há `catalog/` aqui); um produto não corta tags da plataforma"
  }
  if (branch !== "main") {
    return `release — HEAD não está em "main" (está em "${branch}")`
  }
  if (statusOutput.length > 0) {
    return "release — a árvore de trabalho tem alterações não commitadas"
  }
  return undefined
}

function short(sha) {
  return String(sha ?? "").slice(0, 7)
}

function headSha({ exec, cwd }) {
  return exec("git", ["rev-parse", "HEAD"], { cwd }).stdout.trim()
}

function ageMinutes(lease, now) {
  const since = lease?.updatedAt ?? lease?.startedAt ?? 0
  return Math.max(0, Math.round((now() - since) / 60000))
}

function isOwnLease({ leaseApi, lease, holder, env }) {
  if (holder?.id && lease?.holder?.id === holder.id) return true
  return leaseApi.holderMatches({ lease, env })
}

function describeHolder({ leaseApi, lease, holder, env, now }) {
  const own = isOwnLease({ leaseApi, lease, holder, env })
  return `titular ${lease?.holder?.id} [${lease?.holder?.kind}, ${
    own ? "esta sessão" : "outra sessão"
  }], há ${ageMinutes(lease, now)} min`
}

// O head de origin/main vem do `ls-remote`, então o sha pode não existir no
// clone local (fetch antigo). Sem ele, `git log sha..HEAD` não resolve e a
// guarda ficaria cega: busca uma vez, quieto, e só então desiste.
function ensureShaLocally({ exec, cwd, sha }) {
  const present = () =>
    exec("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd }).status === 0
  if (present()) return true
  if (exec("git", ["fetch", "--quiet", "origin", "main"], { cwd }).status !== 0)
    return false
  return present()
}

function subjectsAhead({ exec, cwd, sha }) {
  const result = exec("git", ["log", `${sha}..HEAD`, "--format=%s"], { cwd })
  if (result.status !== 0) return undefined
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function subjectOf({ exec, cwd, sha }) {
  const result = exec("git", ["log", "-1", "--format=%s", sha], { cwd })
  if (result.status !== 0) return undefined
  return result.stdout.trim()
}

function markerVersionOf(subject) {
  const parsed = parseMarkerSubject(subject ?? "")
  return parsed.ok ? parsed.version : undefined
}

// Sempre que uma guarda recusa depois do lease tomado, o lease volta: um
// release que não aconteceu não pode deixar o freeze de pé para a próxima
// sessão.
function refuse({ leaseApi, cwd, exec, holder, env, log, message, exitCode }) {
  leaseApi.releaseLease({ cwd, exec, holder, env })
  log(message)
  return exitCode ?? EXIT_CODES.RELEASE_LOCKED
}

// Passos 7-9: com o marcador local já no lugar (recém-criado ou retomado), é
// aqui que o push acontece. `tracked: false` é o caminho sem lease.
function completeRelease({
  version,
  push,
  markerSha,
  tracked,
  cwd,
  exec,
  log,
  leaseApi,
  holder,
  env,
  now,
}) {
  if (!push) {
    log("git push origin main")
    if (tracked) {
      log(
        `release — marcador v${version} criado; o lease segue em "marker-local" e o freeze está de pé até a tag existir`
      )
      log(
        `release — \`git push origin main\` completa o corte; ${ABORT_CMD} desfaz o marcador`
      )
    }
    return EXIT_CODES.OK
  }

  // Fecha a corrida com um job de tag concorrente: entre o preflight e o push
  // a tag pode ter nascido, e aí o marcador local é lixo — desfaz e sai.
  if (tracked) {
    const tagNow = leaseApi.originTagExists({ cwd, exec, version })
    if (tagNow === true) {
      if (headSha({ exec, cwd }) === markerSha) {
        exec("git", ["reset", "--hard", "HEAD~1"], { cwd })
      }
      leaseApi.releaseLease({ cwd, exec, holder, env })
      log(
        `release — a tag v${version} apareceu na origin enquanto o marcador era criado; o marcador local foi desfeito e o lease devolvido`
      )
      return EXIT_CODES.ALREADY_INSTALLED
    }
    if (tagNow === null) {
      log(
        `release — não deu para reconferir a tag v${version} na origin antes do push; seguindo com a guarda de pre-push`
      )
    }
  }

  // O push é o gatilho do release.yml: falhar aqui deixa o marcador local sem
  // nenhuma tag disparada, e o operador precisa saber disso pelo exit code.
  // `PLATFORM_RELEASE_HOLDER` é o que faz a guarda de pre-push reconhecer que
  // este push é o do titular do lease, e não o de outra sessão.
  const pushOptions = tracked
    ? { cwd, env: { ...env, PLATFORM_RELEASE_HOLDER: holder.id } }
    : { cwd }
  const pushResult = exec("git", ["push", "origin", "main"], pushOptions)
  if (pushResult.status !== 0) {
    log(
      "release — marcador criado, mas `git push origin main` falhou; nenhuma tag foi disparada"
    )
    if (tracked) {
      log(
        `release — o lease continua em "marker-local": rode ${ABORT_CMD} (desfaz o marcador local com segurança), depois \`git pull\`, e refaça o release`
      )
      log(
        "release — NUNCA rode `git pull --rebase` com o marcador local: ele duplica ou descarta o commit vazio"
      )
    }
    return EXIT_CODES.PUSH_FAILED
  }

  if (tracked) {
    leaseApi.updateLease({
      cwd,
      exec,
      holder,
      patch: { stage: "marker-pushed" },
      now,
      env,
    })
  }
  log(`release — marcador v${version} empurrado; a tag sai do gate`)
  if (tracked) {
    log(
      `release — o lease limpa sozinho quando a tag existir — acompanhe com ${STATUS_CMD}`
    )
  }
  return EXIT_CODES.OK
}

// SPEC_DEVIATION: sem `origin` legível o comando roda o fluxo antigo (sem lease
// e sem guardas de origin), em vez de recusar.
// Reason: lease e guardas coordenam sessões *através da origin* — um clone sem
// remote não tem tag remota, nem main remota, nem release concorrente para
// coordenar (e o push falharia depois de qualquer jeito). `git remote get-url`
// só devolve vazio com status 0 quando não há URL a nomear.
function hasUsableOrigin({ exec, cwd }) {
  const result = exec("git", ["remote", "get-url", "origin"], { cwd })
  return result.status === 0 && result.stdout.trim().length > 0
}

export async function planRelease({
  version,
  push = false,
  cwd = process.cwd(),
  exec = defaultExec,
  runPreflight = runReleasePreflight,
  log = defaultLog,
  lease: leaseApi = defaultLease,
  env = process.env,
  now = Date.now,
} = {}) {
  const branch = exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
  }).stdout.trim()
  const statusOutput = exec("git", ["status", "--porcelain"], {
    cwd,
  }).stdout.trim()

  const reason = refusalReason({
    branch,
    statusOutput,
    isTemplate: existsSync(path.join(cwd, "catalog")),
  })
  if (reason) {
    log(reason)
    return EXIT_CODES.USAGE_ERROR
  }

  const resolvedVersion =
    version ??
    readLatestChangelogVersion(path.join(cwd, "docs/dev/template-changelog.md"))

  const runUntracked = async () => {
    const preflightExit = await runPreflight({
      version: resolvedVersion,
      repoRoot: cwd,
      exec,
      log,
    })
    if (preflightExit !== EXIT_CODES.OK) return preflightExit
    exec(
      "git",
      ["commit", "--allow-empty", "-m", `chore(release): v${resolvedVersion}`],
      { cwd }
    )
    return completeRelease({
      version: resolvedVersion,
      push,
      markerSha: undefined,
      tracked: false,
      cwd,
      exec,
      log,
      leaseApi,
      holder: undefined,
      env,
      now,
    })
  }

  if (!hasUsableOrigin({ exec, cwd })) {
    log(
      "release — sem remote `origin` legível: nenhum lease é tomado e as guardas de origin ficam de fora (não há release concorrente para coordenar)"
    )
    return runUntracked()
  }

  const holder = leaseApi.currentHolderId({ env })
  const acquired = leaseApi.acquireLease({
    cwd,
    exec,
    version: resolvedVersion,
    holder,
    now,
  })

  if (acquired.corrupt) {
    log(
      `release — v${resolvedVersion} bloqueada: o lease de release está ilegível, o que é indistinguível de um release em andamento — inspecione com ${STATUS_CMD} ou descarte com \`pnpm platform release --abort --force\``
    )
    return EXIT_CODES.RELEASE_LOCKED
  }

  if (!acquired.ok) {
    const held = acquired.lease
    const own = isOwnLease({ leaseApi, lease: held, holder, env })
    const resumable =
      own &&
      held?.version === resolvedVersion &&
      (held.stage === "marker-local" || held.stage === "marker-pushed")

    if (!resumable) {
      log(
        `release — v${resolvedVersion} bloqueada: já existe um lease v${held?.version} (estágio "${held?.stage}", ${describeHolder({ leaseApi, lease: held, holder, env, now })}) — inspecione com ${STATUS_CMD} ou devolva com ${ABORT_CMD}`
      )
      return EXIT_CODES.RELEASE_LOCKED
    }

    // Retomada: o marcador já existe e é o topo, então o release continua de
    // onde parou. Um segundo marcador aqui seria MARK-07 na cara do gate.
    const head = headSha({ exec, cwd })
    if (head !== held.markerSha) {
      log(
        `release — v${resolvedVersion} bloqueada: o lease aponta para o marcador ${short(held.markerSha)}, mas HEAD é ${short(head)} — o marcador não é mais o topo; desfaça com ${ABORT_CMD} e refaça o release`
      )
      return EXIT_CODES.RELEASE_LOCKED
    }
    log(
      `release — retomando o lease v${resolvedVersion} no estágio "${held.stage}"; o marcador ${short(head)} já existe e nenhum novo será criado`
    )
    return completeRelease({
      version: resolvedVersion,
      push,
      markerSha: head,
      tracked: true,
      cwd,
      exec,
      log,
      leaseApi,
      holder,
      env,
      now,
    })
  }

  const guard = (message, exitCode) =>
    refuse({ leaseApi, cwd, exec, holder, env, log, message, exitCode })

  const tagExists = leaseApi.originTagExists({
    cwd,
    exec,
    version: resolvedVersion,
  })
  if (tagExists === true) {
    return guard(
      `release — a tag v${resolvedVersion} já existe na origin; não há o que liberar (o changelog está atrás do que já saiu)`,
      EXIT_CODES.ALREADY_INSTALLED
    )
  }
  if (tagExists === null) {
    return guard(
      `release — a sonda de tags da origin falhou (\`git ls-remote --tags\`); com a rede cega o release para aqui em vez de arriscar uma tag duplicada de v${resolvedVersion}`
    )
  }

  const originSha = leaseApi.originMainSha({ cwd, exec })
  if (originSha === null) {
    return guard(
      `release — a sonda do head de origin/main falhou (\`git ls-remote origin refs/heads/main\`); sem saber onde a origin está, v${resolvedVersion} não é cortada`
    )
  }
  if (!ensureShaLocally({ exec, cwd, sha: originSha })) {
    return guard(
      `release — o head de origin/main (${short(originSha)}) não está no clone local e o fetch falhou; rode \`git fetch origin main\` antes de cortar v${resolvedVersion}`
    )
  }

  const ahead = subjectsAhead({ exec, cwd, sha: originSha })
  if (ahead === undefined) {
    return guard(
      `release — não deu para listar os commits entre origin/main (${short(originSha)}) e HEAD; rode \`git fetch origin main\` antes de cortar v${resolvedVersion}`
    )
  }
  // Filtro frouxo de propósito, como o `if` do release.yml: um marcador
  // malformado ocupa o mesmo lugar e não pode passar batido.
  const stranded = ahead.find(isMarkerSubject)
  if (stranded) {
    return guard(
      `release — o commit "${stranded}" está entre origin/main e HEAD: há um marcador local órfão. Desfaça com ${ABORT_CMD} antes de cortar v${resolvedVersion}`
    )
  }

  const originHeadSubject = subjectOf({ exec, cwd, sha: originSha })
  if (originHeadSubject === undefined) {
    return guard(
      `release — não deu para ler o assunto do head de origin/main (${short(originSha)}); rode \`git fetch origin main\` antes de cortar v${resolvedVersion}`
    )
  }
  if (isMarkerSubject(originHeadSubject)) {
    const inFlightVersion = markerVersionOf(originHeadSubject)
    const inFlightTagged = inFlightVersion
      ? leaseApi.originTagExists({ cwd, exec, version: inFlightVersion })
      : false
    if (inFlightTagged !== true) {
      return guard(
        `release — o head de origin/main é o marcador "${originHeadSubject}" e a tag correspondente ainda não existe: há um release em voo (ou morto) na origin. Veja ${STATUS_CMD} antes de cortar v${resolvedVersion}`
      )
    }
  }

  // Igualdade não é exigida: a main local corre à frente da origin por design.
  const ancestor = leaseApi.isAncestorOfHead({ cwd, exec, sha: originSha })
  if (ancestor !== true) {
    return guard(
      `release — origin/main (${short(originSha)}) não é ancestral de HEAD: outra sessão ou máquina avançou a main. Rode \`git pull\` antes de cortar v${resolvedVersion}`
    )
  }

  const probe = leaseApi.probeReleaseRuns({ cwd, exec })
  if (probe.available && probe.runs.length > 0) {
    const urls = probe.runs
      .map((run) => run.url ?? `run ${run.databaseId}`)
      .join(", ")
    return guard(
      `release — há release run(s) em andamento na origin: ${urls} — espere terminar antes de cortar v${resolvedVersion} (${STATUS_CMD})`
    )
  }
  if (!probe.available) {
    log(
      "release — sonda cross-machine indisponível (gh); seguindo — a guarda de marker na origin cobre"
    )
  }

  const preflightExit = await runPreflight({
    version: resolvedVersion,
    repoRoot: cwd,
    exec,
    log,
  })
  if (preflightExit !== EXIT_CODES.OK) {
    leaseApi.releaseLease({ cwd, exec, holder, env })
    return preflightExit
  }

  // MARK-12: exatamente um commit vazio e nenhuma tag — a tag é sempre da CI.
  exec(
    "git",
    ["commit", "--allow-empty", "-m", `chore(release): v${resolvedVersion}`],
    { cwd }
  )
  const markerSha = headSha({ exec, cwd })
  leaseApi.updateLease({
    cwd,
    exec,
    holder,
    patch: { stage: "marker-local", markerSha },
    now,
    env,
  })

  return completeRelease({
    version: resolvedVersion,
    push,
    markerSha,
    tracked: true,
    cwd,
    exec,
    log,
    leaseApi,
    holder,
    env,
    now,
  })
}

export async function releaseCommand({
  version,
  push,
  cwd = process.cwd(),
  exec,
  runPreflight,
  log,
  lease,
  env,
  now,
} = {}) {
  return planRelease({
    version,
    push,
    cwd,
    exec,
    runPreflight,
    log,
    lease,
    env,
    now,
  })
}
