import nextPlugin from "@next/eslint-plugin-next"
import boundaries from "eslint-plugin-boundaries"
import tseslint from "typescript-eslint"

function allowTypes(...types) {
  return types.map((type) => ({ to: { element: { type } } }))
}

function fromType(type) {
  return { element: { type } }
}

// Mesma base de fsd.js, com a rota `app/` do Next App Router entrando como
// element próprio: `app` (raiz do repo, roteamento de arquivos) só pode
// importar `_app` (bootstrap/providers) e `_pages` (composição de página) —
// nunca camadas internas direto, mesmo papel de `pages` em fsd.js. `_app` e
// `_pages` levam `_` porque `app`/`pages` já são reservados pelo Next.
export const fsdNextConfig = tseslint.config(
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      // O resolver TS materializa o alias `@/`; sem ele o alvo vira "unknown" e a
      // regra silencia. Mudou o resolver? Valide com uma violação-canário.
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/include": ["app/**/*", "src/**/*"],
      "boundaries/ignore": [
        "app/**/*.{test,spec}.{ts,tsx}",
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/*.d.ts",
      ],
      "boundaries/elements": [
        { type: "app", pattern: "app" },
        { type: "_app", pattern: "src/_app" },
        { type: "_pages", pattern: "src/_pages/*" },
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
            { from: fromType("app"), allow: allowTypes("_app", "_pages") },
            {
              from: fromType("_app"),
              allow: allowTypes(
                "_pages",
                "widgets",
                "features",
                "entities",
                "shared",
              ),
            },
            {
              from: fromType("_pages"),
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
  },
  // `flatConfig.coreWebVitals` já embute as regras de `recommended` (spread
  // interno no pacote) — `configs["core-web-vitals"]` é a variante legada
  // eslintrc (usa `extends` de string), incompatível com tseslint.config().
  nextPlugin.flatConfig.coreWebVitals,
)

export default fsdNextConfig
