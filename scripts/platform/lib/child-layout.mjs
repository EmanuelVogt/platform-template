import path from "node:path"

export const DEFAULT_WEB_BASE = "apps/web/src"

// Caminhos que o `apps/api` do kernel precisa ver para que o typecheck de uma
// entrada resolva; relativos a `apps/api`.
export const KERNEL_STAGE_PATHS = [
  "src/db",
  "src/docs",
  "src/openapi",
  "src/shared",
  "src/app.module.ts",
  "src/bootstrap.product.ts",
  "src/main.ts",
  "src/platform-modules.ts",
  "src/tracing.bootstrap.ts",
  "test",
]

export function webRootFor(name, base = DEFAULT_WEB_BASE) {
  return path.join(base, "entities", name)
}

// `envPath`/`envExamplePath` ficam em apps/api porque é o cwd de onde `pnpm contract`
// (e o boot do Nest) carregam o .env local (loadDotenvForDev -> process.loadEnvFile(),
// relativo ao cwd do processo, não à raiz do monorepo).
export function childLayout(childRoot = "") {
  const at = (...segments) => path.join(childRoot, ...segments)
  return {
    root: childRoot,
    lockPath: at(".platform-modules.lock"),
    copierAnswersPath: at(".copier-answers.yml"),
    envExamplePath: at("apps/api/.env.example"),
    envPath: at("apps/api/.env"),
    platformModulesPath: at("apps/api/src/platform-modules.ts"),
    platformSchemaPath: at("apps/api/src/db/platform-schema.ts"),
    migrationsDir: at("apps/api/drizzle/migrations"),
    apiDir: at("apps/api"),
    moduleDir: (name) => at("apps/api/src/modules", name),
    parityDir: (name) => at("apps/api/src/modules", name, "__parity__"),
    kernelStagePaths: () =>
      KERNEL_STAGE_PATHS.map((rel) => ({ rel, from: at("apps/api", rel) })),
  }
}
