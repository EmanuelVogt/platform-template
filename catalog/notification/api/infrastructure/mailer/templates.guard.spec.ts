import { readdirSync } from "node:fs"
import { join } from "node:path"

// KPB-13: só template genérico (fluxo de conta) mora aqui. Template de produto
// é registrado pelo módulo dono no NotificationTemplateSourceRegistry.
const GENERIC_TEMPLATES = [
  "access-link.hbs",
  "device-new-login.hbs",
  "email-change-notice.hbs",
  "email-change.hbs",
  "layout.hbs",
  "lockout.hbs",
  "password-changed.hbs",
  "reset.hbs",
  "verify.hbs",
]

const TEMPLATES_DIR = join(__dirname, "templates")

describe("templates do notification", () => {
  it("contém exatamente a allowlist genérica", () => {
    const found = readdirSync(TEMPLATES_DIR)
      .filter((name) => name.endsWith(".hbs"))
      .sort()

    expect(found).toEqual([...GENERIC_TEMPLATES].sort())
  })

  it("só tem o partial compartilhado", () => {
    const partials = readdirSync(join(TEMPLATES_DIR, "partials")).sort()

    expect(partials).toEqual(["button.hbs"])
  })
})
