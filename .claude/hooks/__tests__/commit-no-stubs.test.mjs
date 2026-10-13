// Behavioral test for commit-no-stubs.mjs — spawns the hook exactly as Claude Code's
// PreToolUse does (JSON on stdin, exit code + stderr as the verdict) against throwaway
// git repos. Harness tooling — not app code.
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { runHook as spawnHook } from "./run-hook.mjs"

// git exports GIT_DIR/GIT_INDEX_FILE into pre-push hooks; they would point at the real repo
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
)
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: gitEnv,
  })

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "commit-no-stubs-"))
  git(dir, "init", "-q")
  git(dir, "config", "user.email", "hook@test")
  git(dir, "config", "user.name", "hook")
  git(dir, "commit", "-q", "--allow-empty", "-m", "init")
  return dir
}

function put(dir, rel, content, { stage = true } = {}) {
  mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true })
  writeFileSync(path.join(dir, rel), content, "utf8")
  if (stage) git(dir, "add", "--", rel)
}

function runHook({ command, cwd, env }) {
  const { code, stderr } = spawnHook(
    "commit-no-stubs",
    { tool_name: "Bash", tool_input: { command }, cwd },
    { env: { PLATFORM_COMMIT_STUBS_OFF: "", ...env } }
  )
  return { status: code, stderr }
}

const withRepo = (fn) => {
  const dir = makeRepo()
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("passes through a command that is not a git commit", () => {
  withRepo((dir) => {
    put(dir, "src/a.spec.ts", 'it.only("x", () => {});\n')
    assert.equal(runHook({ command: "git status", cwd: dir }).status, 0)
    assert.equal(runHook({ command: "pnpm test", cwd: dir }).status, 0)
  })
})

test("blocks a staged focused test and names file:line", () => {
  withRepo((dir) => {
    put(
      dir,
      "src/a.spec.ts",
      'describe("a", () => {\n  it.only("x", () => {});\n});\n'
    )
    const { status, stderr } = runHook({
      command: 'git commit -m "test: a"',
      cwd: dir,
    })
    assert.equal(status, 2)
    assert.match(stderr, /Commit held/)
    assert.match(stderr, /src\/a\.spec\.ts:2 — focused test/)
    assert.match(stderr, /PLATFORM_COMMIT_STUBS_OFF=1/)
  })
})

test("passes a clean staged change", () => {
  withRepo((dir) => {
    put(
      dir,
      "src/a.spec.ts",
      'it("soma", () => {\n  expect(sum(1, 2)).toBe(3);\n});\n'
    )
    assert.equal(
      runHook({ command: 'git commit -m "test: a"', cwd: dir }).status,
      0
    )
  })
})

test("blocks a bare skip, passes a skip that references an issue, AD or date", () => {
  withRepo((dir) => {
    put(dir, "src/a.spec.ts", 'it.skip("x", () => {});\n')
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 2)
    put(dir, "src/a.spec.ts", 'it.skip("x (#123)", () => {});\n')
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
    put(dir, "src/a.spec.ts", 'it.todo("x — AD-019");\n')
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
    put(dir, "src/a.spec.ts", 'xit("flaky until 2026-10-01", () => {});\n')
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
  })
})

test("blocks a literal-on-literal expect", () => {
  withRepo((dir) => {
    put(
      dir,
      "src/a.spec.ts",
      'it("x", () => {\n  expect(true).toBe(true);\n});\n'
    )
    const { status, stderr } = runHook({ command: "git commit -m x", cwd: dir })
    assert.equal(status, 2)
    assert.match(stderr, /literal-on-literal expect/)
  })
})

test('blocks a "not implemented" throw and a bare NotImplementedException', () => {
  withRepo((dir) => {
    put(
      dir,
      "src/a.ts",
      'export const f = () => {\n  throw new Error("not implemented");\n};\n'
    )
    assert.match(
      runHook({ command: "git commit -m x", cwd: dir }).stderr,
      /stub presented as done/
    )
    put(
      dir,
      "src/a.ts",
      "export const f = () => {\n  throw new NotImplementedException();\n};\n"
    )
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 2)
    put(
      dir,
      "src/a.ts",
      'export const f = () => {\n  throw new Error("Clip not found");\n};\n'
    )
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
  })
})

test("blocks lint/ts suppressions, @ts-expect-error included", () => {
  withRepo((dir) => {
    put(
      dir,
      "src/a.ts",
      "// eslint-disable-next-line no-console\nconsole.log(1);\n"
    )
    assert.match(
      runHook({ command: "git commit -m x", cwd: dir }).stderr,
      /suppression/
    )
    put(dir, "src/a.ts", '// @ts-ignore\nconst x: number = "a";\n')
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 2)
    put(
      dir,
      "src/a.ts",
      '// @ts-expect-error mock type\nconst x: number = "a";\n'
    )
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 2)
  })
})

test("blocks an unconditioned TODO comment, passes one with a date or issue", () => {
  withRepo((dir) => {
    put(
      dir,
      "src/a.ts",
      "// TODO: handle the empty case\nexport const a = 1;\n"
    )
    assert.match(
      runHook({ command: "git commit -m x", cwd: dir }).stderr,
      /TODO\/FIXME/
    )
    put(
      dir,
      "src/a.ts",
      "// TODO(#412): handle the empty case\nexport const a = 1;\n"
    )
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
  })
})

test("reads only the diff the commit records: unstaged is ignored without -a, seen with -a", () => {
  withRepo((dir) => {
    put(dir, "src/a.spec.ts", 'it("ok", () => {});\n')
    git(dir, "commit", "-q", "-m", "base")
    put(dir, "src/a.spec.ts", 'it.only("ok", () => {});\n', { stage: false })
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
    assert.equal(runHook({ command: "git commit -am x", cwd: dir }).status, 2)
    assert.equal(
      runHook({ command: "git commit --all -m x", cwd: dir }).status,
      2
    )
  })
})

test("follows a pathspec: the working tree of the named files is what gets committed", () => {
  withRepo((dir) => {
    put(dir, "src/a.spec.ts", 'it("ok", () => {});\n')
    put(dir, "src/b.spec.ts", 'it("ok", () => {});\n')
    git(dir, "commit", "-q", "-m", "base")
    put(dir, "src/a.spec.ts", 'it.only("ok", () => {});\n', { stage: false })
    put(dir, "src/b.spec.ts", 'it("still ok", () => {});\n', { stage: false })
    assert.equal(
      runHook({ command: "git commit -m x -- src/b.spec.ts", cwd: dir }).status,
      0
    )
    assert.equal(
      runHook({ command: "git commit -m x -- src/a.spec.ts", cwd: dir }).status,
      2
    )
  })
})

test("skips harness hooks, generated code (the Kubb client), declarations and non-code files", () => {
  withRepo((dir) => {
    put(dir, ".claude/hooks/x.mjs", "const re = /it.only(/;\n")
    put(dir, "apps/api/generated/x.ts", "// TODO generated\n")
    put(dir, "packages/api-client/generated/x.ts", "// @ts-ignore generated\n")
    put(dir, "src/x.d.ts", "// @ts-ignore\n")
    put(dir, "docs/notes.md", 'it.only("x")\n')
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
  })
})

test("only added lines count — removing an it.only passes", () => {
  withRepo((dir) => {
    put(dir, "src/a.spec.ts", 'it.only("x", () => {});\n')
    git(dir, "commit", "-q", "-m", "base")
    put(dir, "src/a.spec.ts", 'it("x", () => {});\n')
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
  })
})

test("follows `cd <repo> &&` and `git -C <repo>` from another cwd", () => {
  withRepo((dir) => {
    put(dir, "src/a.spec.ts", 'it.only("x", () => {});\n')
    const elsewhere = mkdtempSync(
      path.join(tmpdir(), "commit-no-stubs-elsewhere-")
    )
    try {
      assert.equal(
        runHook({ command: `cd ${dir} && git commit -m x`, cwd: elsewhere })
          .status,
        2
      )
      assert.equal(
        runHook({ command: `git -C ${dir} commit -m x`, cwd: elsewhere })
          .status,
        2
      )
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })
})

test("escape hatch prefix passes, on the user's say-so", () => {
  withRepo((dir) => {
    put(dir, "src/a.spec.ts", 'it.only("x", () => {});\n')
    assert.equal(
      runHook({
        command: "PLATFORM_COMMIT_STUBS_OFF=1 git commit -m x",
        cwd: dir,
      }).status,
      0
    )
  })
})

test("fails open when git cannot answer (not a repository)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "commit-no-stubs-norepo-"))
  try {
    assert.equal(runHook({ command: "git commit -m x", cwd: dir }).status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("passes a commit message that merely mentions the words", () => {
  withRepo((dir) => {
    put(dir, "src/a.ts", "export const a = 1;\n")
    const cmd =
      'git commit -m "test: remove it.only and the TODO from the spec"'
    assert.equal(runHook({ command: cmd, cwd: dir }).status, 0)
  })
})
