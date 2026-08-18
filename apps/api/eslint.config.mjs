import config from "@workspace/eslint-config/nest"

export default [
  ...config,
  // Opções explícitas: só a severidade herdaria o allow de warn/error/info do base.
  { files: ["src/**/*.ts"], rules: { "no-console": ["error", {}] } },
  // Scripts de linha de comando: falam com o terminal por design, não passam pelo pino.
  {
    files: ["src/db/**", "src/seeds/**", "src/openapi/export-openapi.ts"],
    rules: { "no-console": "off" },
  },
]
