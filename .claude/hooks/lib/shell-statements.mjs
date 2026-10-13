// Splits a Bash command into its statements (on &&, ||, ; and newline) and
// each statement into pipe segments — only where the shell itself would: a
// separator inside quotes or inside a heredoc body is text, not a command.
// Before this, a commit message line starting with "tree is ignored" was
// classified as the `tree` command (2026-09-28).
// Harness tooling — not app code.

const HEREDOC = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/

// top-level pieces of `text`, cut at the separators the matcher recognizes
const split = (text, separatorAt) => {
  const pieces = []
  let current = ""
  let quote = ""
  const heredocs = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      current += ch
      if (ch === "\\" && quote === '"') current += text[++i] ?? ""
      else if (ch === quote) quote = ""
      continue
    }
    if (ch === "\\") {
      current += ch + (text[i + 1] ?? "")
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
      continue
    }
    const heredoc = text.slice(i).match(HEREDOC)
    if (heredoc) {
      heredocs.push({ strip: heredoc[1] === "-", word: heredoc[3] })
      current += heredoc[0]
      i += heredoc[0].length - 1
      continue
    }
    if (ch === "\n" && heredocs.length > 0) {
      // the body belongs to the statement that opened it, up to the delimiter
      for (const { strip, word } of heredocs.splice(0)) {
        while (i < text.length) {
          const end = text.indexOf("\n", i + 1)
          const line = text.slice(i + 1, end === -1 ? text.length : end)
          current += `\n${line}`
          i = end === -1 ? text.length : end
          if ((strip ? line.replace(/^\t+/, "") : line) === word) break
        }
      }
      i--
      continue
    }
    const length = separatorAt(text, i)
    if (length > 0) {
      pieces.push(current)
      current = ""
      i += length - 1
      continue
    }
    current += ch
  }
  pieces.push(current)
  return pieces.map((piece) => piece.trim()).filter(Boolean)
}

const statementSeparator = (text, i) => {
  const two = text.slice(i, i + 2)
  if (two === "&&" || two === "||") return 2
  return text[i] === ";" || text[i] === "\n" ? 1 : 0
}

const pipeSeparator = (text, i) =>
  text[i] === "|" && text[i + 1] !== "|" && text[i - 1] !== "|" ? 1 : 0

export const statements = (command) => split(command, statementSeparator)

export const firstSegment = (statement) =>
  split(statement, pipeSeparator)[0] ?? ""
