import fsdConfig from "@workspace/eslint-config/fsd"
import config from "@workspace/eslint-config/react"
import { vitestConfig } from "@workspace/eslint-config/vitest"

export default [
  { ignores: ["dist", "node_modules", ".turbo", "scripts/**/*.mjs"] },
  ...config,
  ...fsdConfig,
  ...vitestConfig,
]
