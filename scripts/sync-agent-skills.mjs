#!/usr/bin/env node
import { readdirSync, lstatSync, readlinkSync, symlinkSync, unlinkSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(repoRoot, ".agents", "skills")

// Cursor e Codex leem .agents/skills nativamente; só o Claude Code precisa da ponte.
const mirrors = [join(repoRoot, ".claude", "skills")]

const isSkill = (name) => !name.startsWith(".") && existsSync(join(source, name, "SKILL.md"))

const skills = readdirSync(source).filter(isSkill).sort()
const changes = []

for (const mirror of mirrors) {
  mkdirSync(mirror, { recursive: true })

  for (const skill of skills) {
    const link = join(mirror, skill)
    const target = join("..", "..", ".agents", "skills", skill)
    const current = lstatSync(link, { throwIfNoEntry: false })

    if (current?.isSymbolicLink() && readlinkSync(link) === target) continue

    if (current) {
      if (current.isDirectory()) {
        rmSync(link, { recursive: true })
        changes.push(`substituída cópia solta: ${skill}`)
      } else {
        unlinkSync(link)
        changes.push(`link refeito: ${skill}`)
      }
    } else {
      changes.push(`link criado: ${skill}`)
    }

    symlinkSync(target, link)
  }

  for (const entry of readdirSync(mirror)) {
    const link = join(mirror, entry)
    if (!lstatSync(link).isSymbolicLink()) continue
    if (existsSync(link)) continue
    unlinkSync(link)
    changes.push(`link órfão removido: ${entry}`)
  }
}

console.log(`${skills.length} skills em .agents/skills`)
console.log(changes.length ? changes.map((c) => `  ${c}`).join("\n") : "  nada a fazer")
