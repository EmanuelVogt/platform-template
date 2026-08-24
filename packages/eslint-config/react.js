import jsxA11y from "eslint-plugin-jsx-a11y"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"

import { baseConfig } from "./base.js"
import { srOnlyRequiresPositionedAncestor } from "./rules/sr-only-requires-positioned-ancestor.js"

const platformPlugin = {
  rules: {
    "sr-only-requires-positioned-ancestor": srOnlyRequiresPositionedAncestor,
  },
}

export const reactConfig = tseslint.config(
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    ...react.configs.flat.recommended,
    settings: {
      react: { version: "19.0" },
    },
  },
  react.configs.flat["jsx-runtime"],
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-curly-brace-presence": [
        "error",
        { props: "never", children: "never" },
      ],
      "react/self-closing-comp": "error",
      "react/jsx-boolean-value": ["error", "never"],
      "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
      "react/jsx-pascal-case": "error",
      "react/no-array-index-key": "warn",
      "react/no-unstable-nested-components": ["error", { allowAsProps: true }],
      "react/hook-use-state": "error",

      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["**/*.{tsx,jsx}"],
    plugins: { platform: platformPlugin },
    rules: {
      "platform/sr-only-requires-positioned-ancestor": "error",
    },
  },
  {
    // Label é primitive que repassa htmlFor via props; a associação é garantida
    // no call-site, não na definição. A regra não enxerga forwarding e marca
    // false-positive no próprio primitive.
    files: ["**/components/label.tsx"],
    rules: {
      "jsx-a11y/label-has-associated-control": "off",
    },
  },
  {
    // Router TanStack code-based exporta objetos de rota junto do componente;
    // `allowConstantExport` não cobre call expression. O full reload nesses
    // arquivos é aceito de propósito — a regra segue valendo em todo o resto.
    files: ["**/app/router/router.tsx", "**/app/router/shell.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // TanStack Router sinaliza navegação lançando `redirect()`/`notFound()` — são
    // os sinais de controle do framework, não erros. Permite lançar só esses
    // tipos; qualquer outro throw de não-Error continua barrado.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/only-throw-error": [
        "error",
        {
          allow: [
            {
              from: "package",
              package: "@tanstack/router-core",
              name: ["Redirect", "NotFoundError"],
            },
            {
              from: "package",
              package: "@tanstack/react-router",
              name: ["Redirect", "NotFoundError"],
            },
          ],
        },
      ],
    },
  },
  {
    // Arquivos de declaração usam `interface` para module augmentation
    // (ex.: `Register` do TanStack Router) — `type` não faz declaration merging.
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  }
)

export default reactConfig
