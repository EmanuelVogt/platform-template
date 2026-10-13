import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import { runHook } from "./run-hook.mjs"

const plan = (wave2Touches) => `# Tasks

### T1 — repository
- **Touches**: \`apps/api/src/modules/order/infrastructure/repositories/order.repository.ts\`

### T2 — service
- **Touches**: \`${wave2Touches}\`

### T3 — screen
- **Touches**: \`apps/web/src/features/order/ui/order-list.tsx\`

## Wave Plan

| Wave | Cluster | Tasks | Touches |
| --- | --- | --- | --- |
| 1 | C1 | T1 | repository |
| 1 | C2 | T2 | service |
| 2 | C3 | T3 | screen |
`

const withPlan = (content, fn) => {
  const root = mkdtempSync(join(tmpdir(), "wave-plan-"))
  const file = join(root, ".specs", "features", "order", "tasks.md")
  mkdirSync(join(root, ".specs", "features", "order"), { recursive: true })
  writeFileSync(file, content)
  try {
    fn(file, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("wave-plan-check: blocks two clusters of one wave touching the same file", () => {
  withPlan(
    plan(
      "apps/api/src/modules/order/infrastructure/repositories/order.repository.ts"
    ),
    (file) => {
      const { code, stderr } = runHook("wave-plan-check", {
        tool_input: { file_path: file },
      })

      assert.equal(code, 2)
      assert.match(stderr, /Wave 1: C1 and C2 both touch/)
    }
  )
})

test("wave-plan-check: passes a plan whose sibling clusters own disjoint files", () => {
  withPlan(
    plan("apps/api/src/modules/order/application/create-order.use-case.ts"),
    (file) => {
      const { code, stderr } = runHook("wave-plan-check", {
        tool_input: { file_path: file },
      })

      assert.equal(code, 0)
      assert.equal(stderr, "")
    }
  )
})

test("wave-plan-check: checks a ca-full-cycle run plan the same way", () => {
  const root = mkdtempSync(join(tmpdir(), "wave-plan-"))
  const dir = join(root, ".ca-plans", "checkout-funnel")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, "plan.md")
  writeFileSync(
    file,
    plan(
      "apps/api/src/modules/order/infrastructure/repositories/order.repository.ts"
    ).replace(/- \*\*Touches\*\*: /g, "Touches: ")
  )
  try {
    const { code, stderr } = runHook("wave-plan-check", {
      tool_input: { file_path: file },
    })

    assert.equal(code, 2)
    assert.match(stderr, /Wave 1: C1 and C2 both touch/)
    assert.match(stderr, /ca-full-cycle plan\.md § Cross-check/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("wave-plan-check: ignores any file that is not a task plan", () => {
  withPlan(
    plan(
      "apps/api/src/modules/order/infrastructure/repositories/order.repository.ts"
    ),
    (_file, root) => {
      const other = join(root, "tasks.md")
      writeFileSync(
        other,
        plan(
          "apps/api/src/modules/order/infrastructure/repositories/order.repository.ts"
        )
      )
      assert.equal(
        runHook("wave-plan-check", { tool_input: { file_path: other } }).code,
        0
      )
    }
  )
})

test("wave-plan-check: malformed stdin exits 0 silently", () => {
  const { code, stdout, stderr } = runHook("wave-plan-check", "not json")

  assert.equal(code, 0)
  assert.equal(stdout, "")
  assert.equal(stderr, "")
})
