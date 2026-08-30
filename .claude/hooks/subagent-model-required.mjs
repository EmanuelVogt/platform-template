#!/usr/bin/env node
// PreToolUse(Agent): the model tier of a subagent in this repo is chosen by
// whoever dispatches, on every dispatch — never the frontmatter. The `model:`
// in the agent file is only the fallback for when this hook is off; here, a
// call to repo-scout or shell-runner without an explicit `model` is blocked
// with that agent's tier guide, and the call comes back with the chosen
// tier. It applies on the main thread. Rationale in .agents/skills/agent-harness/SKILL.md.
// It also holds the nesting shape: NESTING_AGENTS is empty — this repo defines
// no agent type that nests through this hook (a predecessor framework's worker
// and verifier roles once did); repo-scout and shell-runner (LEAF_AGENTS) still
// never dispatch further.
// Measured 2026-08-20: 24 of 24 `fork` agents spawned by workers were
// `Agent(subagent_type: "fork", prompt: "noop")` placeholders "to wait for a
// background notification" — each one re-served the worker's whole context
// for nothing, since a dispatched scout/runner re-invokes its caller when it
// finishes. Blocked with the reason.
// Escape hatch for debugging the harness itself: PLATFORM_DELEGATE_OFF=1.
// Harness tooling — not app code.
import { readFileSync } from "node:fs"

const MODELS = new Set(["haiku", "sonnet", "opus", "fable"])
const NESTING_AGENTS = new Set([])
const LEAF_AGENTS = new Set(["repo-scout", "shell-runner"])

const GUIDE = {
  "repo-scout": [
    "haiku  — pinpoint question: where X is defined, who consumes Y, what exists in file Z.",
    "sonnet — map of a whole module/feature, or when finding it requires judging where a rule lives.",
    "opus   — only when the question crosses couplings grep cannot see (Zod→Kubb, outbox) and the answer decides architecture; before that, split the question in two for haiku.",
  ],
  "shell-runner": [
    "haiku  — the main window's gates: the orchestrator's Build gate per wave, the Verifier's Final gate. Output returned literally, not interpreted.",
    "sonnet — one of those gates whose log carries dozens of failures to slice without losing any, or a multi-step run in a worktree/env to set up carefully.",
    "not for a worker's scoped gate: workers and the wave verifier run their own commands (`cmd > log 2>&1; echo exit=$?`, then grep the log).",
  ],
}

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

if (process.env.PLATFORM_DELEGATE_OFF === "1") process.exit(0)
if (data.tool_name !== "Agent") process.exit(0)

const type = data.tool_input?.subagent_type
const guide = GUIDE[type]
const model = data.tool_input?.model

const block = (msg) => {
  process.stderr.write(msg)
  process.exit(2)
}

if (LEAF_AGENTS.has(data.agent_type)) {
  block(
    `Dispatch of \`${type}\` blocked — scouts and runners never nest: answer from what you have.\n`
  )
}
if (NESTING_AGENTS.has(data.agent_type) && !LEAF_AGENTS.has(type)) {
  block(
    `\`${type}\` cannot be dispatched from a ${data.agent_type}: workers and the Verifier nest only \`repo-scout\` and \`shell-runner\`.
A \`fork\` inherits your whole context (every placeholder re-serves it); a 'noop' agent to wait for a notification is never needed — a dispatched scout/runner re-invokes you when it finishes: end your turn with nothing else pending, its result arrives as a notification.
`
  )
}

// The footer of the terminal lists running agents as `<type>  <description>`
// and has no slot for the model — so the tier is prefixed to the description
// itself, and the label survives into the footer.
function tagDescription() {
  const tier = typeof model === "string" ? model : "inherit"
  const description = String(data.tool_input?.description ?? "")
  if (description.startsWith("[")) process.exit(0)
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: {
          ...data.tool_input,
          description: `[${tier}] ${description}`,
        },
      },
    })
  )
  process.exit(0)
}

if (!guide) tagDescription()
if (typeof model === "string" && MODELS.has(model)) tagDescription()

const reason =
  typeof model === "string"
    ? `\`model: "${model}"\` is not a tier of this repo (haiku, sonnet, opus, fable)`
    : "no explicit `model`"

process.stderr.write(
  `Dispatch of \`${type}\` blocked — ${reason}.

The tier is your choice on every dispatch; the agent's frontmatter does not decide. Repeat the call with
\`model\` and state the reason for the choice in your dispatch line:
  Agent(subagent_type: "${type}", model: "<haiku|sonnet|opus|fable>", prompt: "…")

Guide for ${type}:
${guide.map((line) => `  ${line}`).join("\n")}

Failed twice on a tier? Go up a tier before repeating the same question.
`
)
process.exit(2)
