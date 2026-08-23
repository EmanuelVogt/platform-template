import { z } from "zod"

// Mensagens de validação do Zod em pt-BR e humanizadas. O default da lib é
// inglês; a locale `pt` oficial ainda fala "string" ("esperado que string
// tivesse >=N caracteres"), jargão que o usuário final não entende. Aqui
// interceptamos os casos de texto com cópia humana e delegamos o resto pra `pt`.
// Como web e api-client resolvem a mesma instância zod, cobre tanto os schemas
// gerados pelo Kubb quanto os estendidos no front. Mensagem por campo
// (schema-level, ex.: `.min(1, "…")`) tem prioridade sobre este piso.
const ptLocale = z.locales.pt()

z.config({
  localeError: (issue) => {
    if (issue.code === "too_small" && issue.origin === "string") {
      const min = Number(issue.minimum)
      return min <= 1 ? "Campo obrigatório." : `Use ao menos ${min} caracteres.`
    }
    if (issue.code === "too_big" && issue.origin === "string") {
      return `Use no máximo ${Number(issue.maximum)} caracteres.`
    }
    if (issue.code === "invalid_type" && issue.expected === "string") {
      return "Campo obrigatório."
    }
    return ptLocale.localeError(issue)
  },
})
