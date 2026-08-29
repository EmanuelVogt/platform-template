import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOK_PATH = path.join(
  REPO_ROOT,
  ".claude",
  "hooks",
  "qa-retro-ledger.mjs"
)

function runHook(input, env = {}) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: "utf8",
  })
  return { code: result.status, stderr: result.stderr }
}

function makeRun({ review, lessons } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "qa-retro-fixture-"))
  const runDir = path.join(dir, ".ca-plans", "some-feature")
  mkdirSync(runDir, { recursive: true })
  if (review !== undefined)
    writeFileSync(path.join(runDir, "review.md"), review)
  if (lessons !== undefined) {
    writeFileSync(path.join(dir, ".ca-plans", "LESSONS.md"), lessons)
  }
  return { dir, planPath: path.join(runDir, "plan.md") }
}

const doneEdit = (planPath) => ({
  tool_input: { file_path: planPath, new_string: "Status: Done" },
})

test("ignores files outside .ca-plans plan files", () => {
  const { code } = runHook({
    tool_input: { file_path: "/tmp/x/notes.md", new_string: "Status: Done" },
  })
  assert.equal(code, 0)
})

test("ignores a plan write that is not the Done transition", () => {
  const { dir, planPath } = makeRun({
    review: "## QA Log\n- F1 · round 1 · broken thing\n",
  })
  const { code } = runHook({
    tool_input: { file_path: planPath, new_string: "Status: Review" },
  })
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 0)
})

test("allows Done when review.md is absent", () => {
  const { dir, planPath } = makeRun()
  const { code } = runHook(doneEdit(planPath))
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 0)
})

test("allows Done when every finding carries a marker and the lesson exists", () => {
  const { dir, planPath } = makeRun({
    review:
      "## QA Log\n- F1 · round 1 · sidebar item missing · fix abc123 · → L-01\n- F2 · round 1 · wants new filter · scope · → brief-error\n",
    lessons:
      "L-01 · type · silent-drop filter · guard: x · run, 2026-08-28 · hits: 1\n",
  })
  const { code, stderr } = runHook(doneEdit(planPath))
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 0, stderr)
})

test("blocks Done on a finding line without a retro marker", () => {
  const { dir, planPath } = makeRun({
    review: "## QA Log\n- F1 · round 1 · sidebar item missing · fix abc123\n",
  })
  const { code, stderr } = runHook(doneEdit(planPath))
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 2)
  assert.match(stderr, /without a retro marker/)
})

test("blocks Done when a marker points to a missing LESSONS.md entry", () => {
  const { dir, planPath } = makeRun({
    review:
      "## QA Log\n- F1 · round 1 · sidebar item missing · fix abc123 · → L-07\n",
    lessons:
      "L-01 · test · other pattern · guard: y · run, 2026-08-28 · hits: 1\n",
  })
  const { code, stderr } = runHook(doneEdit(planPath))
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 2)
  assert.match(stderr, /no LESSONS\.md entry: L-07/)
})

test("blocks Done when the QA Log heading carries trailing text", () => {
  const { dir, planPath } = makeRun({
    review: "## QA Log — round 3\n- F1 · round 3 · unmarked finding\n",
  })
  const { code, stderr } = runHook(doneEdit(planPath))
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 2)
  assert.match(stderr, /without a retro marker/)
})

test("blocks Done when the referenced lesson has no guard field", () => {
  const { dir, planPath } = makeRun({
    review:
      "## QA Log\n- F1 · round 1 · sidebar item missing · fix abc123 · → L-01\n",
    lessons:
      "L-01 · lesson · some pattern with no guard recorded · run, 2026-08-28 · hits: 1\n",
  })
  const { code, stderr } = runHook(doneEdit(planPath))
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 2)
  assert.match(stderr, /without a `guard:` field: L-01/)
})

test("escape hatch disables the check", () => {
  const { dir, planPath } = makeRun({
    review: "## QA Log\n- F1 · round 1 · unmarked finding\n",
  })
  const { code } = runHook(doneEdit(planPath), { PLATFORM_RETRO_OFF: "1" })
  rmSync(dir, { recursive: true, force: true })
  assert.equal(code, 0)
})
