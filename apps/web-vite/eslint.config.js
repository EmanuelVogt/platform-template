import fsdConfig from "@workspace/eslint-config/fsd"
import config from "@workspace/eslint-config/react"

export default [
  { ignores: ["dist", "node_modules", ".turbo", "scripts/**/*.mjs"] },
  ...config,
  ...fsdConfig,
]
