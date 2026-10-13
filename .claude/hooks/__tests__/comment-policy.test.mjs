import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import { makeFixtureRepo, removeFixtureRepo, runHook } from "./run-hook.mjs"

test("comment-policy: blocks a TODO with no measurable removal condition", () => {
  const fixture = makeFixtureRepo()
  try {
    const { code, stderr } = runHook("comment-policy", {
      tool_input: {
        file_path: join(fixture, "apps/api/src/some.service.ts"),
        new_string: "// TODO clean this up later\nexport const value = 1;",
      },
    })

    assert.equal(code, 2)
    assert.match(stderr, /TODO\/FIXME/)
  } finally {
    removeFixtureRepo(fixture)
  }
})

test("comment-policy: blocks an eslint-disable comment", () => {
  const fixture = makeFixtureRepo()
  try {
    const { code, stderr } = runHook("comment-policy", {
      tool_input: {
        file_path: join(fixture, "apps/web/src/some.ts"),
        new_string: "// eslint-disable-next-line\nconst x = 1;",
      },
    })

    assert.equal(code, 2)
    assert.match(stderr, /suppressing lint is forbidden/)
  } finally {
    removeFixtureRepo(fixture)
  }
})

test("comment-policy: blocks a visual banner comment", () => {
  const fixture = makeFixtureRepo()
  try {
    const { code, stderr } = runHook("comment-policy", {
      tool_input: {
        file_path: join(fixture, "apps/web/src/some.ts"),
        new_string: "// ---------------------------\nconst x = 1;",
      },
    })

    assert.equal(code, 2)
    assert.match(stderr, /banner/)
  } finally {
    removeFixtureRepo(fixture)
  }
})

test("comment-policy: reports a generic comment as non-blocking context", () => {
  const fixture = makeFixtureRepo()
  try {
    const { code, stdout } = runHook("comment-policy", {
      tool_input: {
        file_path: join(fixture, "apps/web/src/some.ts"),
        new_string:
          "// works around a bug in library X, see upstream issue\nconst x = 1;",
      },
    })

    assert.equal(code, 0)
    const payload = JSON.parse(stdout)
    assert.match(
      payload.hookSpecificOutput.additionalContext,
      /\.agents\/skills\/code-quality\/SKILL\.md/
    )
  } finally {
    removeFixtureRepo(fixture)
  }
})

test("comment-policy: skips the generated api-client", () => {
  const fixture = makeFixtureRepo()
  try {
    const { code, stdout } = runHook("comment-policy", {
      tool_input: {
        file_path: join(
          fixture,
          "packages/api-client/generated/hooks/useThing.ts"
        ),
        new_string: "// TODO fix this\nconst x = 1;",
      },
    })

    assert.equal(code, 0)
    assert.equal(stdout, "")
  } finally {
    removeFixtureRepo(fixture)
  }
})

test("comment-policy: malformed stdin exits 0 silently", () => {
  const { code, stdout, stderr } = runHook("comment-policy", "not json")

  assert.equal(code, 0)
  assert.equal(stdout, "")
  assert.equal(stderr, "")
})

test("comment-policy: nudges on an unsourced narrative comment, not on a sourced one", () => {
  const fixture = makeFixtureRepo()
  try {
    const nudge = runHook("comment-policy", {
      tool_input: {
        file_path: join(fixture, "apps/api/src/some.service.ts"),
        new_string:
          "// usually the founder books one slot per week\nexport const value = 1;",
      },
    })
    assert.equal(nudge.code, 0)
    assert.match(
      JSON.parse(nudge.stdout).hookSpecificOutput.additionalContext,
      /Unsourced narrative \(1\)/
    )

    const sourced = runHook("comment-policy", {
      tool_input: {
        file_path: join(fixture, "apps/api/src/some.service.ts"),
        new_string:
          "// usually one order per slot — AD-21\nexport const value = 1;",
      },
    })
    assert.equal(sourced.code, 0)
    assert.doesNotMatch(
      JSON.parse(sourced.stdout).hookSpecificOutput.additionalContext,
      /Unsourced narrative/
    )
  } finally {
    removeFixtureRepo(fixture)
  }
})
