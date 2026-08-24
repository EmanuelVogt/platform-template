import globals from "globals"
import tseslint from "typescript-eslint"

import { baseConfig } from "./base.js"

export const nestConfig = tseslint.config(...baseConfig, {
  files: ["**/*.ts"],
  languageOptions: {
    globals: { ...globals.node },
  },
  rules: {
    // Nest depende muito de DI por classe e decorators
    "@typescript-eslint/no-extraneous-class": "off",
    "@typescript-eslint/parameter-properties": "off",

    // interfaces fazem mais sentido em contratos de DTO/repo
    "@typescript-eslint/consistent-type-definitions": "off",

    // require-await atrapalha handlers Nest com retorno Promise<void>
    "@typescript-eslint/require-await": "off",

    // decorators usam metadata que ESLint não enxerga
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
  },
})

export default nestConfig
