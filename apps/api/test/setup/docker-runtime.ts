import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const IN_VM_SOCKET = "/var/run/docker.sock"

const CANDIDATE_SOCKETS = [
  join(homedir(), ".colima", "default", "docker.sock"),
  join(homedir(), ".docker", "run", "docker.sock"),
  IN_VM_SOCKET,
]

function hostFromDockerContext(): string | null {
  try {
    const out = execFileSync(
      "docker",
      ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim()
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

function hostFromCandidateSockets(): string | null {
  const socket = CANDIDATE_SOCKETS.find((path) => existsSync(path))
  return socket === undefined ? null : `unix://${socket}`
}

/**
 * Aponta o testcontainers para o daemon quando ele roda numa VM com socket fora
 * de `/var/run` (Colima, Docker Desktop, Rancher): a busca dele é por caminhos
 * fixos e ignora o contexto do Docker CLI, então falha com "Could not find a
 * working container runtime strategy" mesmo com o `docker` funcionando.
 *
 * O `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` parece redundante com o
 * `DOCKER_HOST`, mas não é: o Ryuk (reaper de containers órfãos) recebe o socket
 * como bind mount e o caminho do *host* não existe dentro da VM — montá-lo falha
 * com "operation not supported". Sem ele, a saída seria desligar o Ryuk e deixar
 * Postgres/Redis vazando quando a suíte é morta.
 *
 * No-op com daemon nativo (Linux/CI) e quando o ambiente já traz a variável.
 */
export function ensureDockerRuntimeEnv(): void {
  if (process.env.DOCKER_HOST === undefined) {
    const host = hostFromDockerContext() ?? hostFromCandidateSockets()
    if (host !== null) process.env.DOCKER_HOST = host
  }
  const host = process.env.DOCKER_HOST ?? ""
  const daemonInVm = host.startsWith("unix://") && !host.endsWith(IN_VM_SOCKET)
  if (
    daemonInVm &&
    process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE === undefined
  ) {
    process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE = IN_VM_SOCKET
  }
}
