// Mesmo padrão numérico de `STABLE_TAG` em template-version.mjs — a versão
// aceita aqui precisa ser exatamente a que aquela função aceitaria como tag.
const MARKER_SUBJECT = /^chore\(release\): v(\d+)\.(\d+)\.(\d+)$/
const MARKER_PREFIX = "chore(release):"

export function parseMarkerSubject(subject) {
  const match = MARKER_SUBJECT.exec(subject)
  if (!match) {
    return {
      ok: false,
      reason: `assunto "${subject}" não bate com a gramática do marcador de release — esperado "chore(release): vX.Y.Z" (semver estável, sem prerelease, um espaço)`,
    }
  }
  return { ok: true, version: `${match[1]}.${match[2]}.${match[3]}` }
}

// Frouxo de propósito: o `if` do workflow usa o mesmo prefixo. Um filtro
// estrito aqui deixaria um marcador malformado passar batido pelo `if` e
// nunca chegar a `decideRelease`, que é quem falha alto (MARK-06).
export function isMarkerSubject(subject) {
  return subject.startsWith(MARKER_PREFIX)
}

function nonHeadSubjects(subjects, headSubject) {
  const rest = [...subjects]
  const index = rest.indexOf(headSubject)
  if (index !== -1) rest.splice(index, 1)
  return rest
}

// Precedência de falha fixada pelo spec: MARK-06 (head malformado) antes de
// MARK-07 (marcador não é o head) antes de MARK-08 (marcador altera
// arquivos) — não reordenar.
export function decideRelease({ headSubject, subjects, changedFiles }) {
  const headIsMarker = isMarkerSubject(headSubject)
  let parsedHead
  if (headIsMarker) {
    parsedHead = parseMarkerSubject(headSubject)
    if (!parsedHead.ok) return { action: "fail", reason: parsedHead.reason }
  }

  const earlierMarker = nonHeadSubjects(subjects, headSubject).find(
    isMarkerSubject
  )
  if (earlierMarker) {
    return {
      action: "fail",
      reason: `commit "${earlierMarker}" carrega um marcador de release mas não é o head do push — o marcador precisa ser o último commit enviado`,
    }
  }

  if (!headIsMarker) return { action: "skip" }

  if (changedFiles.length > 0) {
    return {
      action: "fail",
      reason: `o commit marcador "${headSubject}" alterou ${changedFiles.length} arquivo(s) — o marcador não pode carregar conteúdo`,
    }
  }

  return { action: "release", version: parsedHead.version }
}
