import { test } from "node:test"
import assert from "node:assert/strict"
import { runHook } from "./run-hook.mjs"

test("subagent-model-required: blocks repo-scout dispatch without a model", () => {
  const { code, stderr } = runHook("subagent-model-required", {
    tool_name: "Agent",
    tool_input: { subagent_type: "repo-scout", description: "find a symbol" },
  })

  assert.equal(code, 2)
  assert.match(stderr, /repo-scout/)
  assert.match(stderr, /haiku/)
})

test("subagent-model-required: allows repo-scout dispatch with an explicit model", () => {
  const { code, stderr } = runHook("subagent-model-required", {
    tool_name: "Agent",
    tool_input: {
      subagent_type: "repo-scout",
      model: "sonnet",
      description: "map the module",
    },
  })

  assert.equal(code, 0)
  assert.equal(stderr, "")
})

test("subagent-model-required: ignores subagent types outside the tiered set", () => {
  const { code, stderr } = runHook("subagent-model-required", {
    tool_name: "Agent",
    tool_input: {
      subagent_type: "general-purpose",
      description: "do something",
    },
  })

  assert.equal(code, 0)
  assert.equal(stderr, "")
})

test("subagent-model-required: PLATFORM_DELEGATE_OFF=1 bypasses the block", () => {
  const { code, stderr } = runHook(
    "subagent-model-required",
    {
      tool_name: "Agent",
      tool_input: { subagent_type: "repo-scout", description: "find a symbol" },
    },
    { env: { PLATFORM_DELEGATE_OFF: "1" } }
  )

  assert.equal(code, 0)
  assert.equal(stderr, "")
})

test("subagent-model-required: malformed stdin exits 0 silently", () => {
  const { code, stdout, stderr } = runHook(
    "subagent-model-required",
    "not json"
  )

  assert.equal(code, 0)
  assert.equal(stdout, "")
  assert.equal(stderr, "")
})

test("subagent-model-required: a scout or runner never nests another agent", () => {
  const { code, stderr } = runHook("subagent-model-required", {
    tool_name: "Agent",
    agent_id: "a1",
    agent_type: "repo-scout",
    tool_input: {
      subagent_type: "repo-scout",
      model: "haiku",
      description: "nested",
    },
  })

  assert.equal(code, 2)
  assert.match(stderr, /never nest/)
})

test("subagent-model-required: a spec-worker dispatches only repo-scout and shell-runner", () => {
  const fork = runHook("subagent-model-required", {
    tool_name: "Agent",
    agent_id: "w1",
    agent_type: "spec-worker",
    tool_input: { subagent_type: "fork", prompt: "noop", description: "wait" },
  })
  assert.equal(fork.code, 2)
  assert.match(fork.stderr, /nest only `repo-scout` and `shell-runner`/)

  const scout = runHook("subagent-model-required", {
    tool_name: "Agent",
    agent_id: "w1",
    agent_type: "spec-worker",
    tool_input: {
      subagent_type: "repo-scout",
      model: "haiku",
      description: "find it",
    },
  })
  assert.equal(scout.code, 0)
})

test("subagent-model-required: opus for a spec-worker is escalation-only", () => {
  const first = runHook("subagent-model-required", {
    tool_name: "Agent",
    tool_input: {
      subagent_type: "spec-worker",
      model: "opus",
      description: "C1 domain",
      prompt: "cluster C1",
    },
  })
  assert.equal(first.code, 2)
  assert.match(first.stderr, /escalation-only/)

  const escalated = runHook("subagent-model-required", {
    tool_name: "Agent",
    tool_input: {
      subagent_type: "spec-worker",
      model: "opus",
      description: "C1 escalation: verifier FAIL r1",
      prompt: "cluster C1",
    },
  })
  assert.equal(escalated.code, 0)
  assert.match(escalated.stdout, /\[opus\] C1 escalation/)
})

test("subagent-model-required: a general-purpose worker is only tagged with its tier", () => {
  const { code, stdout } = runHook("subagent-model-required", {
    tool_name: "Agent",
    tool_input: {
      subagent_type: "general-purpose",
      model: "sonnet",
      description: "wave 1 C1",
    },
  })

  assert.equal(code, 0)
  assert.match(stdout, /\[sonnet\] wave 1 C1/)
})
