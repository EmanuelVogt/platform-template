import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

// `apps/api/.env` está em `_exclude` no `copier.yml` (guarda segredo, nunca é
// sobrescrito) — por isso as três quebras desta major (AD-034) só chegam ao
// filho se este script editar o `.env` real dele, não o `.env.example`.

const ENV_RELATIVE_PATH = path.join("apps", "api", ".env")

// Nomes antigos -> nomes novos que a seam de storage renomeia (spec.md, área
// "Storage seam"). `R2_ACCOUNT_ID` não tem par novo — o adaptador genérico
// não modela conta, só endpoint/bucket/credenciais/região.
const STORAGE_RENAMES = [
  ["R2_ACCESS_KEY_ID", "STORAGE_ACCESS_KEY_ID"],
  ["R2_SECRET_ACCESS_KEY", "STORAGE_SECRET_ACCESS_KEY"],
  ["R2_BUCKET", "STORAGE_BUCKET"],
  ["R2_ENDPOINT", "STORAGE_ENDPOINT"],
]

// R2 nunca expôs região pro chamador — usava "auto" implícito. Preservar esse
// valor evita quebrar um filho que continua atrás do R2 pelo adaptador S3
// genérico, que agora exige `STORAGE_REGION` explícito.
const PREVIOUS_STORAGE_REGION = "auto"

// Fuso fixo no kernel antes da 3.0.0 (commit 4b614eb: "APP_TIMEZONE replaces
// the hard-coded clinic timezone"; ver docs/advisories/ADV-20260824-04.md).
// É o valor que um filho `2.x` de fato usava — não o novo default `UTC`.
const PREVIOUS_TIMEZONE = "America/Sao_Paulo"

// Marcador do bloco abaixo: presença = já oferecido, não repete (idempotência)
// mesmo com as duas linhas comentadas (não batem no `hasActiveKey`).
const COOKIE_ESCAPE_HATCH_MARKER =
  "# v3.0.0 migration: cookie name escape hatch"

const COOKIE_ESCAPE_HATCH_BLOCK = `
${COOKIE_ESCAPE_HATCH_MARKER} — see docs/advisories/ADV-20260824-03.md
# Uncomment and set the previous values to keep every live session logged in;
# leave commented to accept the new __Host-app_session / app_csrf defaults.
# COOKIE_NAME=
# CSRF_COOKIE_NAME=
`

function hasActiveKey(content, key) {
  return new RegExp(`^${key}=`, "m").test(content)
}

function withTrailingNewline(content) {
  return content.endsWith("\n") ? content : `${content}\n`
}

function renameStorageKeys(content) {
  let next = content
  let renamed = false
  for (const [oldKey, newKey] of STORAGE_RENAMES) {
    const re = new RegExp(`^${oldKey}=`, "m")
    if (re.test(next)) {
      next = next.replace(re, `${newKey}=`)
      renamed = true
    }
  }
  if (renamed && !hasActiveKey(next, "STORAGE_REGION")) {
    next = `${withTrailingNewline(next)}STORAGE_REGION=${PREVIOUS_STORAGE_REGION}\n`
  }
  return next
}

// Preserva o corte de dia/semana que o filho já tinha: só escreve quando
// `APP_TIMEZONE` está ausente — um valor já declarado (mesmo `UTC`) é escolha
// do filho e não é sobrescrita.
function preserveTimezone(content) {
  if (hasActiveKey(content, "APP_TIMEZONE")) return content
  return `${withTrailingNewline(content)}APP_TIMEZONE=${PREVIOUS_TIMEZONE}\n`
}

// Oferece a saída (não decide por ninguém): se o filho já renomeou o cookie
// de sessão por conta própria, a escolha dele fica — o edge case do spec é
// explícito sobre isso. Ausência de qualquer escolha -> deixa as duas
// variáveis comentadas, prontas pra decisão no próximo deploy.
function offerCookieEscapeHatch(content) {
  if (
    hasActiveKey(content, "COOKIE_NAME") ||
    content.includes(COOKIE_ESCAPE_HATCH_MARKER)
  ) {
    return content
  }
  return `${withTrailingNewline(content)}${COOKIE_ESCAPE_HATCH_BLOCK}`
}

export async function run({ cwd, log }) {
  const envPath = path.join(cwd, ENV_RELATIVE_PATH)
  if (!existsSync(envPath)) {
    log(`v3.0.0: ${ENV_RELATIVE_PATH} não existe — nada a migrar`)
  } else {
    const original = readFileSync(envPath, "utf8")
    let next = renameStorageKeys(original)
    next = preserveTimezone(next)
    next = offerCookieEscapeHatch(next)
    if (next !== original) {
      writeFileSync(envPath, next, "utf8")
      log(`v3.0.0: ${ENV_RELATIVE_PATH} atualizado (storage/timezone/cookies)`)
    } else {
      log(`v3.0.0: ${ENV_RELATIVE_PATH} já migrado — no-op`)
    }
  }

  // Derrubar o literal `professional` do enum `identity.access_profile`
  // exige um banco vivo, em uma transação separada de qualquer uma que grave
  // literal novo (AD-004 documenta essa armadilha simétrica). Este script só
  // enxerga o checkout do filho, nunca a conexão — por isso o passo fica
  // registrado de forma explícita em vez de silenciado, sempre que a
  // migração roda, apontando pro passo a passo completo.
  log(
    "v3.0.0: o literal 'professional' do enum identity.access_profile exige migração de banco manual (ALTER TYPE em transação própria, AD-004) — siga docs/advisories/ADV-20260824-01.md"
  )
}
