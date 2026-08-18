import boundaries from "eslint-plugin-boundaries"
import tseslint from "typescript-eslint"

function allowTypes(...types) {
  return types.map((type) => ({ to: { element: { type } } }))
}

function fromType(type) {
  return { element: { type } }
}

// Export separado do ./react de propósito: packages/ui também consome ./react
// e não tem camadas FSD. Same-slice não precisa de allow — import interno ao
// element nunca é checado; slice irmão é element distinto e cai no disallow.
// Exceção "keys": *.keys.ts é superfície pública cross-entity — invalidação de
// cache cruza domínios (mutação de activity invalida agenda/room) e içar isso
// pra camada acima refatoraria todos os wrappers de mutation.
export const fsdConfig = tseslint.config({
  files: ["src/**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    // O resolver TS materializa o alias `@/`; sem ele o alvo vira "unknown" e a
    // regra silencia. Mudou o resolver? Valide com uma violação-canário.
    "import/resolver": { typescript: { alwaysTryTypes: true } },
    "boundaries/include": ["src/**/*"],
    "boundaries/ignore": ["src/**/*.{test,spec}.{ts,tsx}", "src/**/*.d.ts"],
    "boundaries/elements": [
      { type: "app", pattern: "src/app" },
      { type: "pages", pattern: "src/pages/*" },
      { type: "widgets", pattern: "src/widgets/*" },
      { type: "features", pattern: "src/features/*" },
      { type: "entities", pattern: "src/entities/*" },
      { type: "shared", pattern: "src/shared" },
    ],
    "boundaries/files": [
      { category: "keys", pattern: "src/entities/*/api/*.keys.ts" },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        message:
          "FSD: {{ from.type }} não pode importar {{ to.type }} daqui (camada acima ou slice irmão) — docs/front/front-arch.md, Regras de Ouro 1-2",
        policies: [
          {
            from: fromType("app"),
            allow: allowTypes("pages", "widgets", "features", "entities", "shared"),
          },
          {
            from: fromType("pages"),
            allow: allowTypes("widgets", "features", "entities", "shared"),
          },
          {
            from: fromType("widgets"),
            allow: allowTypes("features", "entities", "shared"),
          },
          { from: fromType("features"), allow: allowTypes("entities", "shared") },
          {
            from: fromType("entities"),
            allow: [
              ...allowTypes("shared"),
              {
                to: {
                  element: { type: "entities" },
                  file: { categories: "keys" },
                },
              },
            ],
          },
          { from: fromType("shared"), allow: allowTypes("shared") },
        ],
      },
    ],
  },
})

export default fsdConfig
