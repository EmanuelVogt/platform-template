import fsdNextConfig from "@workspace/eslint-config/fsd-next"
import config from "@workspace/eslint-config/react"

export default [
  // test/setup.ts referencia `@/_app/config/zod-locale` (adicionado em T9); ignorado até lá
  // para não quebrar o project service do parser type-aware.
  { ignores: [".next", "node_modules", ".turbo", "test"] },
  ...config,
  ...fsdNextConfig,
]
