import vitest from "@vitest/eslint-plugin"
import jestDom from "eslint-plugin-jest-dom"
import testingLibrary from "eslint-plugin-testing-library"

const TEST_FILES = ["**/*.{spec,int-spec,e2e-spec,test}.{ts,tsx}"]

const TEST_SUPPORT_FILES = [
  "**/vitest.setup.ts",
  "**/shared/test/**/*.{ts,tsx}",
  "test/**/*.ts",
]

/**
 * Regras de teste do Vitest, sem Testing Library — api e scripts.
 *
 * Contrato do suite em `docs/test/testing.md`. Arquivos de suporte (setup,
 * helpers de `shared/test`, `test/**`) recebem só o `recommended` do plugin;
 * o endurecimento (`.only`/`.skip` barrados, teste sem asserção etc.) vale
 * para os arquivos de teste de fato — é lá que a disciplina importa.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const vitestNodeConfig = [
  {
    ...vitest.configs.recommended,
    files: [...TEST_FILES, ...TEST_SUPPORT_FILES],
  },
  {
    files: TEST_FILES,
    plugins: { vitest },
    rules: {
      // Um `.only`/`.skip` esquecido apaga o resto do suite justamente no
      // pre-push; um teste sem asserção é ruído que passa sempre.
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/no-standalone-expect": "error",
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expect*", "**.expect"] },
      ],
      "vitest/no-conditional-expect": "error",
      "vitest/no-conditional-in-test": "error",
      "vitest/no-identical-title": "error",
      "vitest/prefer-to-be": "error",
      "vitest/prefer-to-have-length": "error",
      "vitest/valid-expect": "error",
      "vitest/consistent-test-it": ["error", { fn: "it" }],
      "vitest/require-top-level-describe": "error",
      "max-nested-callbacks": ["error", 4],
    },
  },
]

/**
 * Regras de teste do front: Vitest + Testing Library.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const vitestConfig = [
  ...vitestNodeConfig,
  {
    ...testingLibrary.configs["flat/react"],
    files: TEST_FILES,
    rules: {
      ...testingLibrary.configs["flat/react"].rules,
      "testing-library/prefer-user-event": "error",
      "testing-library/no-manual-cleanup": "error",
      "testing-library/prefer-explicit-assert": "error",
      "testing-library/prefer-presence-queries": "error",
    },
  },
  {
    ...jestDom.configs["flat/recommended"],
    files: TEST_FILES,
  },
]
