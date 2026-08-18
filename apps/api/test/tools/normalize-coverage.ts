import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Jest sintetiza um mapa de instrumentação para os arquivos que o tier NÃO
 * carregou (é o `collectCoverageFrom` que faz o não-testado contar), e sob
 * @swc/jest esse mapa sintético é mais grosso que o real — `app.module.ts` sai
 * com 10 statements sem carga e 45 com. O `nyc merge` casa por path e não
 * reconcilia mapas de shape diferente: soma os dois, o denominador infla e a
 * régua despenca (branches 32% no lugar de 57%). Tiers que de fato carregaram o
 * mesmo arquivo produzem mapas idênticos, então descartar o sintético quando
 * existe o real basta para o merge voltar a ser união.
 */
type FileCoverage = {
  s: Record<string, number>
}
type CoverageMap = Record<string, FileCoverage | undefined>

const dir = process.argv[2]
if (!dir) {
  throw new Error("uso: normalize-coverage.ts <dir-com-os-json-dos-tiers>")
}

const tiers = readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({
    name,
    coverage: JSON.parse(readFileSync(join(dir, name), "utf8")) as CoverageMap,
    keep: new Set<string>(),
  }))

function wasLoaded(entry: FileCoverage): boolean {
  return Object.values(entry.s).some((hits) => hits > 0)
}

const paths = new Set(tiers.flatMap((tier) => Object.keys(tier.coverage)))
let discarded = 0

for (const path of paths) {
  const present: typeof tiers = []
  const loaded: typeof tiers = []
  for (const tier of tiers) {
    const entry = tier.coverage[path]
    if (entry === undefined) continue
    present.push(tier)
    if (wasLoaded(entry)) loaded.push(tier)
  }

  // Sem nenhuma carga o mapa é sintético em todos: manter um só, senão o merge
  // soma N cópias do mesmo arquivo descoberto.
  const keep = loaded.length > 0 ? loaded : present.slice(0, 1)
  for (const tier of present) {
    if (keep.includes(tier)) tier.keep.add(path)
    else discarded++
  }
}

for (const tier of tiers) {
  const kept = Object.fromEntries(
    Object.entries(tier.coverage).filter(([path]) => tier.keep.has(path))
  )
  writeFileSync(join(dir, tier.name), JSON.stringify(kept))
}

process.stdout.write(
  `normalize-coverage: ${discarded} mapas sintéticos descartados em ${paths.size} arquivos\n`
)
