import { EXIT_CODES } from "./lib/exit-codes.mjs";

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

export async function run(argv) {
  const { command, positionals, options } = parseArgs(argv);
  const handler = commands.get(command);
  if (!handler) {
    process.stderr.write(`comando desconhecido: ${command ?? "(nenhum)"}\n`);
    return EXIT_CODES.USAGE_ERROR;
  }
  return handler({ positionals, options });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await run(process.argv.slice(2));
  process.exit(exitCode ?? EXIT_CODES.OK);
}
