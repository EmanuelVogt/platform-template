import { defineConfig } from "@kubb/core"
import { pluginOas } from "@kubb/plugin-oas"
import { pluginReactQuery } from "@kubb/plugin-react-query"
import { pluginTs } from "@kubb/plugin-ts"
import { pluginZod } from "@kubb/plugin-zod"

// Lê o contrato versionado na raiz do monorepo e gera o client em ./generated.
// generated/ é commitado e NUNCA editado à mão (docs/arch/front.md Golden Rule 10).
export default defineConfig({
  root: ".",
  input: { path: "../../openapi.json" },
  output: {
    path: "./generated",
    clean: true,
    // Imports gerados com extensão .js — exigido por ESM/Node e compatível com
    // o emit do tsc (sem .ts em import, que quebraria o build).
    extension: { ".ts": ".js" },
  },
  plugins: [
    pluginOas({ validate: true }),
    pluginTs({
      output: { path: "models" },
      enumType: "asConst",
    }),
    pluginZod({
      output: { path: "zod" },
      typed: true,
    }),
    pluginReactQuery({
      output: { path: "hooks" },
      client: {
        // Os hooks importam o adapter axios do runtime do package (.js para ESM/Node).
        importPath: "../../src/client.js",
      },
      query: { methods: ["get"] },
      mutation: { methods: ["post", "put", "delete", "patch"] },
    }),
  ],
})
