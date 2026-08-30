#!/usr/bin/env node
// Lê os transcripts que o Claude Code grava fora do repo, em
// ~/.claude/projects/<slug>/. O baseline para comparar está em
// .agents/skills/agent-harness/SKILL.md — sem ele os números aqui não decidem nada.
//
// Uso: pnpm tokens:report [--sessions N] [--include-worktrees]
import { readFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : Number(args[i + 1])
}
const SESSIONS = flag("--sessions", 30)
const INCLUDE_WORKTREES = args.includes("--include-worktrees")

// O slug é o cwd com as barras viradas em hífen; worktrees ganham slug próprio.
const REPO_SLUG = process.cwd().replace(/\//g, "-")
const PROJECTS = join(homedir(), ".claude", "projects")

const transcripts = () => {
  const dirs = readdirSync(PROJECTS).filter((d) =>
    INCLUDE_WORKTREES ? d.startsWith(REPO_SLUG) : d === REPO_SLUG
  )
  const files = dirs.flatMap((d) =>
    readdirSync(join(PROJECTS, d))
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(PROJECTS, d, f))
  )
  return files
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs)
    .slice(-SESSIONS)
}

const CATEGORIAS = [
  ["busca (grep/find/ls)", /\b(grep|rg|find|ls|fd)\b/],
  ["leitura via shell (cat/sed/head)", /\b(cat|sed|head|tail|awk)\b/],
  ["testes", /\b(test|vitest)\b/],
  ["typecheck/build/lint", /\b(typecheck|tsc|build|lint|check)\b/],
  ["git", /\bgit\b/],
  ["contract/kubb", /\b(contract|kubb|openapi)\b/],
]

const add = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n)
const texto = (content) =>
  typeof content === "string" ? content : JSON.stringify(content ?? "")

const uso = { cacheRead: 0, cacheCreate: 0, output: 0 }
const porFerramenta = new Map()
const chamadas = new Map()
const entradaFerramenta = new Map()
const bashPorCategoria = new Map()
const bashChamadas = new Map()
const sessoes = []
let turnos = 0

for (const file of transcripts()) {
  const pendentes = new Map()
  let turnosSessao = 0
  let base = 0
  let pico = 0
  let leitura = 0

  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    const content = e.message?.content

    if (e.type === "assistant") {
      const u = e.message?.usage
      if (u) {
        const ctx =
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.input_tokens ?? 0)
        if (ctx > 0) {
          turnos += 1
          turnosSessao += 1
          if (!base) base = ctx
          if (ctx > pico) pico = ctx
          leitura += u.cache_read_input_tokens ?? 0
          uso.cacheRead += u.cache_read_input_tokens ?? 0
          uso.cacheCreate += u.cache_creation_input_tokens ?? 0
          uso.output += u.output_tokens ?? 0
        }
      }
      for (const b of content ?? []) {
        if (b?.type !== "tool_use") continue
        pendentes.set(b.id, { nome: b.name, input: b.input ?? {} })
        add(entradaFerramenta, b.name, JSON.stringify(b.input ?? {}).length)
      }
    } else if (e.type === "user" && Array.isArray(content)) {
      for (const b of content) {
        if (b?.type !== "tool_result") continue
        const { nome = "?", input = {} } = pendentes.get(b.tool_use_id) ?? {}
        const n = texto(b.content).length
        add(porFerramenta, nome, n)
        add(chamadas, nome)
        if (nome === "Bash") {
          const cmd = input.command ?? ""
          const cat = CATEGORIAS.find(([, re]) => re.test(cmd))?.[0] ?? "outros"
          add(bashPorCategoria, cat, n)
          add(bashChamadas, cat)
        }
      }
    }
  }
  if (turnosSessao)
    sessoes.push({ file, turnos: turnosSessao, base, pico, leitura })
}

const k = (n) => `${Math.round(n / 1000).toLocaleString("pt-BR")}k`
const pct = (n, total) => `${((100 * n) / total).toFixed(1)}%`
const tabela = (map, chamadasMap) => {
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nome, v]) => {
      const c = chamadasMap?.get(nome) ?? 0
      return `  ${nome.padEnd(34)}${String(c).padStart(6)}x ${k(v).padStart(9)} chars  ${pct(v, total).padStart(6)}`
    })
    .join("\n")
}

sessoes.sort((a, b) => b.leitura - a.leitura)
const bases = sessoes.map((s) => s.base).sort((a, b) => a - b)
const contextoMedio = Math.round(uso.cacheRead / (turnos || 1))

console.log(
  `\n=== ${sessoes.length} sessões, ${turnos} turnos de assistente ===`
)
console.log(
  `  cache read   ${uso.cacheRead.toLocaleString("pt-BR")}  <- o custo dominante`
)
console.log(`  cache create ${uso.cacheCreate.toLocaleString("pt-BR")}`)
console.log(`  output       ${uso.output.toLocaleString("pt-BR")}`)
console.log(`\n  contexto médio por turno: ${k(contextoMedio)}`)
console.log(
  `  piso de sessão nova (mediana do 1º turno): ${k(bases[Math.floor(bases.length / 2)] ?? 0)}`
)

const top = sessoes.slice(0, 8)
const concentracao = top.reduce((a, s) => a + s.leitura, 0)
console.log(
  `\n=== sessões mais caras (${pct(concentracao, uso.cacheRead || 1)} do cache read) ===`
)
console.log("  turnos    piso    pico   cache read")
for (const s of top) {
  console.log(
    `  ${String(s.turnos).padStart(6)}${k(s.base).padStart(8)}${k(s.pico).padStart(8)}${k(s.leitura).padStart(13)}`
  )
}

console.log("\n=== volume de resultado por ferramenta ===")
console.log(tabela(porFerramenta, chamadas))
console.log("\n=== saída de Bash por categoria (navegação é o alvo) ===")
console.log(tabela(bashPorCategoria, bashChamadas))

const delegacao = chamadas.get("Agent") ?? 0
const navegacao =
  (bashChamadas.get("busca (grep/find/ls)") ?? 0) +
  (bashChamadas.get("leitura via shell (cat/sed/head)") ?? 0)
console.log(
  `\n=== delegação ===\n  ${delegacao} chamadas de Agent contra ${navegacao} de navegação direta` +
    `\n  (a métrica que o repo-scout precisa mover; em 2026-08-17 era 50 contra 949)\n`
)
