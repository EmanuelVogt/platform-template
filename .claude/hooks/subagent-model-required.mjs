#!/usr/bin/env node
// PreToolUse(Agent): the model tier of a subagent in this repo is chosen by
// whoever dispatches, on every dispatch — never the frontmatter. The `model:`
// in the agent file is only the fallback for when this hook is off; here, a
// call to repo-scout, shell-runner, spec-worker or spec-verifier without an
// explicit `model` is blocked with that agent's tier guide, and the call comes
// back with the chosen tier. It applies on the main thread and inside subagents
// that nest (spec-worker → repo-scout). Rationale in docs/agents/harness.md.
// Escape hatch for debugging the harness itself: PLATFORM_DELEGATE_OFF=1.
// Harness tooling — not app code.
import { readFileSync } from 'node:fs';

const MODELS = new Set(['haiku', 'sonnet', 'opus']);

const GUIDE = {
  'repo-scout': [
    'haiku  — pinpoint question: where X is defined, who consumes Y, what exists in file Z.',
    'sonnet — map of a whole module/feature, or when finding it requires judging where a rule lives.',
    'opus   — only when the question crosses couplings grep cannot see (Zod→Kubb, outbox) and the answer decides architecture; before that, split the question in two for haiku.',
  ],
  'shell-runner': [
    'haiku  — any single command: the output is returned literally, not interpreted.',
    'sonnet — a multi-step command or one in a worktree/env that must be set up carefully, or a log with dozens of failures to slice without losing any.',
  ],
  'spec-worker': [
    'sonnet — default for every cluster: CRUD, screen, form, query, tests, root config, tooling, CI, docs.',
    'haiku  — mechanical cluster only: rename, move a file, fix an import, fixture, snapshot — payload must forbid reformatting.',
    'opus   — narrow: domain entities/transitions, transaction/outbox/ALS, migration, Zod/OpenAPI contract regen, rule governed by an ADR.',
  ],
  'spec-verifier': [
    'sonnet — default for every feature, including tooling/CI/docs/build-path features.',
    'opus   — only when the spec touches auth, payment, availability/booking rules, or data integrity (P0).',
  ],
};

let data;
try {
  data = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (process.env.PLATFORM_DELEGATE_OFF === '1') process.exit(0);
if (data.tool_name !== 'Agent') process.exit(0);

const type = data.tool_input?.subagent_type;
const guide = GUIDE[type];
const model = data.tool_input?.model;

// The footer of the terminal lists running agents as `<type>  <description>`
// and has no slot for the model — so the tier is prefixed to the description
// itself, and the label survives into the footer.
function tagDescription() {
  const tier = typeof model === 'string' ? model : 'inherit';
  const description = String(data.tool_input?.description ?? '');
  if (description.startsWith('[')) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { ...data.tool_input, description: `[${tier}] ${description}` },
      },
    }),
  );
  process.exit(0);
}

if (!guide) tagDescription();
if (typeof model === 'string' && MODELS.has(model)) tagDescription();

const reason =
  typeof model === 'string'
    ? `\`model: "${model}"\` is not a tier of this repo (haiku, sonnet, opus)`
    : 'no explicit `model`';

process.stderr.write(
  `Dispatch of \`${type}\` blocked — ${reason}.

The tier is your choice on every dispatch; the agent's frontmatter does not decide. Repeat the call with
\`model\` and state the reason for the choice in your dispatch line:
  Agent(subagent_type: "${type}", model: "<haiku|sonnet|opus>", prompt: "…")

Guide for ${type}:
${guide.map((line) => `  ${line}`).join('\n')}

Failed twice on a tier? Go up a tier before repeating the same question.
`,
);
process.exit(2);
