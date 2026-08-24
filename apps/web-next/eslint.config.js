import fsdNextConfig from "@workspace/eslint-config/fsd-next"
import config from "@workspace/eslint-config/react"

export default [
  { ignores: [".next", "node_modules", ".turbo"] },
  ...config,
  ...fsdNextConfig,
]
