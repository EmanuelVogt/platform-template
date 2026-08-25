import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

// GT10 — v2.4.0 shipped a defect that only affects `web_stack=next`, while its
// own release run reported 8/8 green: release.yml never ran `template:smoke`
// and its `catalog:check` matrix had no `web_stack` dimension, though ci.yml
// had both. This guard is the invariant, not the list it evaluates today:
// every check ci.yml performs on `push: main` must also be performed
// somewhere in release.yml — commands AND matrix dimensions — so a check
// added to CI later cannot silently go missing from the release. It targets
// the jobs ci.yml itself marks `if: needs.detect.outputs.template == 'true'`
// (derived from the condition string already in the file, not a hardcoded
// job list): the only ci.yml jobs that carry a `web_stack` matrix leg at all,
// i.e. the only place a next-only defect like GT3's could hide from a gate
// that never runs that leg.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")
const CI_PATH = path.join(ROOT_DIR, ".github/workflows/ci.yml")
const RELEASE_PATH = path.join(ROOT_DIR, ".github/workflows/release.yml")

const TEMPLATE_GATE_CONDITION = "needs.detect.outputs.template == 'true'"
const PULL_REQUEST_ONLY_PATTERN = /github\.event_name\s*==\s*'pull_request'/

function readWorkflow(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"))
}

function isPullRequestOnly(step) {
  return typeof step.if === "string" && PULL_REQUEST_ONLY_PATTERN.test(step.if)
}

// The jobs of `jobs` that ci.yml itself scopes to the template repo — the
// only ones a defect visible only under a non-default `web_stack` can hide
// in, since they are the only ones with that matrix dimension at all.
function templateGateJobs(jobs) {
  return Object.entries(jobs).filter(
    ([, job]) =>
      typeof job.if === "string" && job.if.includes(TEMPLATE_GATE_CONDITION)
  )
}

// Every `run:` command a template-gate job performs on a plain push to main
// (excludes steps restricted to `pull_request`, which never run on push).
function requiredCommands(ciJobs) {
  const commands = new Set()
  for (const [, job] of templateGateJobs(ciJobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== "string") continue
      if (isPullRequestOnly(step)) continue
      commands.add(step.run.trim())
    }
  }
  return commands
}

function allCommands(jobs) {
  const commands = new Set()
  for (const job of Object.values(jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run === "string") commands.add(step.run.trim())
    }
  }
  return commands
}

// Commands ci.yml requires (on push:main) that no job of `releaseJobs`
// performs anywhere — the release side is allowed to run them from a
// differently named job (e.g. ci's `gates` folds into release's `verify`).
function findMissingCommands(ciJobs, releaseJobs) {
  const have = allCommands(releaseJobs)
  return [...requiredCommands(ciJobs)].filter((cmd) => !have.has(cmd))
}

function matrixDimensions(jobs, jobName) {
  const matrix = jobs[jobName]?.strategy?.matrix
  return matrix ? Object.keys(matrix).sort() : null
}

// For every template-gate job of ci.yml that declares a matrix, the
// same-named job of release.yml (job identity: `catalog`/`smoke` name the
// same thing in both files) must declare at least the same dimensions.
function findMissingMatrixDimensions(ciJobs, releaseJobs) {
  const missing = []
  for (const [name] of templateGateJobs(ciJobs)) {
    const ciDims = matrixDimensions(ciJobs, name)
    if (!ciDims) continue
    const releaseDims = matrixDimensions(releaseJobs, name) ?? []
    for (const dim of ciDims) {
      if (!releaseDims.includes(dim)) missing.push(`${name}.${dim}`)
    }
  }
  return missing
}

const ci = readWorkflow(CI_PATH)
const release = readWorkflow(RELEASE_PATH)

test("GT10: template-gate jobs of ci.yml exist and carry a web_stack matrix leg — the pattern this guard relies on is not obsolete", () => {
  const gateJobs = templateGateJobs(ci.jobs)
  assert.ok(
    gateJobs.length > 0,
    `no job of ci.yml matched if: ${TEMPLATE_GATE_CONDITION} — has the condition changed?`
  )
  const withWebStack = gateJobs.filter(([name]) =>
    matrixDimensions(ci.jobs, name)?.includes("web_stack")
  )
  assert.ok(
    withWebStack.length > 0,
    "no template-gate job of ci.yml carries a web_stack matrix dimension — GT10's whole premise depends on at least one existing"
  )
})

test("GT10: every command a template-gate job of ci.yml runs on push:main also runs somewhere in release.yml", () => {
  const missing = findMissingCommands(ci.jobs, release.jobs)
  assert.deepEqual(
    missing,
    [],
    `release.yml is missing command(s) ci.yml performs on push:main: ${missing.join(" | ")}`
  )
})

test("GT10: every matrix dimension a template-gate job of ci.yml declares also exists in release.yml's same-named job", () => {
  const missing = findMissingMatrixDimensions(ci.jobs, release.jobs)
  assert.deepEqual(
    missing,
    [],
    `release.yml is missing matrix dimension(s) ci.yml's same-named job declares: ${missing.join(", ")}`
  )
})

// --- red proof: the guard actually detects the two ways release.yml can
// fall behind, not just pass by construction on the current files.

test("GT10 red proof: removing a required command from a release.yml job is caught", () => {
  const required = [...requiredCommands(ci.jobs)]
  assert.ok(required.length > 0, "no required command to remove for the proof")
  const commandToDrop = required[0]

  const mutatedReleaseJobs = structuredClone(release.jobs)
  for (const job of Object.values(mutatedReleaseJobs)) {
    job.steps = (job.steps ?? []).filter(
      (step) => step.run?.trim() !== commandToDrop
    )
  }

  const missing = findMissingCommands(ci.jobs, mutatedReleaseJobs)
  assert.ok(
    missing.includes(commandToDrop),
    `dropping "${commandToDrop}" from every release.yml job did not turn the command-parity check red`
  )
})

test("GT10 red proof: removing a matrix dimension from a release.yml job is caught", () => {
  const [jobName, dimension] = (() => {
    for (const [name] of templateGateJobs(ci.jobs)) {
      const dims = matrixDimensions(ci.jobs, name)
      if (dims?.length) return [name, dims[0]]
    }
    return [undefined, undefined]
  })()
  assert.ok(
    jobName,
    "no template-gate job with a matrix dimension to remove for the proof"
  )
  assert.ok(
    release.jobs[jobName]?.strategy?.matrix?.[dimension],
    `release.yml's "${jobName}" job has no "${dimension}" dimension to remove — is the fix in place?`
  )

  const mutatedReleaseJobs = structuredClone(release.jobs)
  delete mutatedReleaseJobs[jobName].strategy.matrix[dimension]

  const missing = findMissingMatrixDimensions(ci.jobs, mutatedReleaseJobs)
  assert.ok(
    missing.includes(`${jobName}.${dimension}`),
    `removing "${dimension}" from release.yml's "${jobName}" job matrix did not turn the matrix-parity check red`
  )
})
