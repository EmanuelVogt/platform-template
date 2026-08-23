import { EXIT_CODES } from "./lib/exit-codes.mjs";
import { addCommand } from "./lib/commands/add.mjs";
import { adoptCommand } from "./lib/commands/adopt.mjs";
import { detectCommand } from "./lib/commands/advisory.mjs";
import { feedbackCommand } from "./lib/commands/feedback.mjs";
import { listCommand } from "./lib/commands/list.mjs";
import { statusCommand } from "./lib/commands/status.mjs";

const commands = new Map();

export function registerCommand(name, handler) {
  commands.set(name, handler);
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positionals = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      i++;
    } else {
      options[key] = true;
    }
  }

  return { command, positionals, options };
}

function updateCommand(name) {
  process.stdout.write(
    `module update ainda não é automatizado — use a skill \`port-module-update\` para portar ${name} manualmente (o port é tarefa de agente por design); a rotina completa de atualização do produto é a skill \`template-update\`.\n`,
  );
  return EXIT_CODES.OK;
}

registerCommand("module", async ({ positionals, options, deps }) => {
  const [sub, name] = positionals;
  switch (sub) {
    case "add":
      return addCommand({ name, options, ...deps });
    case "adopt":
      return adoptCommand({ name, options, ...deps });
    case "list":
      return listCommand({ options, ...deps });
    case "update":
      return updateCommand(name);
    default:
      process.stderr.write(`subcomando desconhecido: module ${sub ?? "(nenhum)"}\n`);
      return EXIT_CODES.USAGE_ERROR;
  }
});

registerCommand("status", async ({ options, deps }) => statusCommand({ options, ...deps }));

registerCommand("feedback", async ({ positionals, options, deps }) =>
  feedbackCommand({ draftPath: positionals[0], options, ...deps }),
);

registerCommand("advisory", async ({ positionals, deps }) => {
  const [sub, id] = positionals;
  if (sub === "detect") {
    return detectCommand({ id, ...deps });
  }
  process.stderr.write(`subcomando desconhecido: advisory ${sub ?? "(nenhum)"}\n`);
  return EXIT_CODES.USAGE_ERROR;
});

export async function run(argv, deps = {}) {
  const { command, positionals, options } = parseArgs(argv);
  const handler = commands.get(command);
  if (!handler) {
    process.stderr.write(`comando desconhecido: ${command ?? "(nenhum)"}\n`);
    return EXIT_CODES.USAGE_ERROR;
  }
  return handler({ positionals, options, deps });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await run(process.argv.slice(2));
  process.exit(exitCode ?? EXIT_CODES.OK);
}
