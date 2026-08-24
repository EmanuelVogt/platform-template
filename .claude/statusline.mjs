#!/usr/bin/env node
// Status line: shows how much context the session carries, because that number is
// the price of every following turn — the whole conversation is resent every time.
// Without it the growth is invisible and only shows up on the bill. Complements the
// session-context-checkpoint.mjs hook: the hook catches the extreme case, here it is
// the continuous sense of it. Harness tooling — not app code.
import { existsSync, readFileSync } from "node:fs"
import { basename } from "node:path"
import { readContextTokens } from "./hooks/lib/transcript-context.mjs"

const ATTENTION = 150_000
const EXPENSIVE = 300_000

const DIM = "\u001b[2m"
const YELLOW = "\u001b[33m"
const RED = "\u001b[31m"
const RESET = "\u001b[0m"

const paint = (color, text) => `${color}${text}${RESET}`

try {
  const input = JSON.parse(readFileSync(0, "utf8"))
  const parts = []

  const dir = input.workspace?.current_dir ?? input.cwd
  if (dir) parts.push(paint(DIM, basename(dir)))

  const model = input.model?.display_name
  if (model) parts.push(paint(DIM, model))

  const transcriptPath = input.transcript_path
  if (transcriptPath && existsSync(transcriptPath)) {
    const tokens = readContextTokens(transcriptPath)
    if (tokens > 0) {
      const label = `ctx ${Math.round(tokens / 1000)}k`
      if (tokens >= EXPENSIVE)
        parts.push(paint(RED, `${label} · split the session`))
      else if (tokens >= ATTENTION) parts.push(paint(YELLOW, label))
      else parts.push(paint(DIM, label))
    }
  }

  process.stdout.write(parts.join(paint(DIM, " · ")))
} catch {
  // The status line must never break the UI: any failure outputs blank.
}
process.exit(0)
