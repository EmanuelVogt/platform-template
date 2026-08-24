import { pathToFileURL } from "node:url"

// `import.meta.url` é sempre file:// com percent-encoding (RFC 3986); `process.argv[1]` é o
// caminho bruto do sistema de arquivos. Concatenar `file://${process.argv[1]}` quebra em
// qualquer caminho com espaço ou outro caractere especial — pathToFileURL normaliza os dois
// lados antes de comparar.
export function isMain(moduleUrl, argv1) {
  if (!argv1) return false
  return moduleUrl === pathToFileURL(argv1).href
}
