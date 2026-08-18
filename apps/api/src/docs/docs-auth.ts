import { apiReference } from "@scalar/nestjs-api-reference"
import express from "express"

import { setSessionCookie } from "../modules/identity/api/guards/cookie"
import { LoginUseCase } from "../modules/identity/application/use-cases/login/login.use-case"
import { InvalidCredentialsError } from "../modules/identity/domain/errors"
import { SESSION_REPOSITORY } from "../modules/identity/domain/ports/session.repository"
import { TOKEN_GENERATOR } from "../modules/identity/domain/ports/token-generator"
import { IDENTITY_CONFIG } from "../modules/identity/identity.config"
import { CLOCK } from "../shared/kernel/clock/clock"
import { LoggerFactory } from "../shared/kernel/logging/logger.factory"

import { DOCS_LOGIN_CSP, renderDocsLoginPage } from "./docs-login.template"

import type { SessionRepository } from "../modules/identity/domain/ports/session.repository"
import type { TokenGenerator } from "../modules/identity/domain/ports/token-generator"
import type { IdentityConfig } from "../modules/identity/identity.config"
import type { Clock } from "../shared/kernel/clock/clock"
import type { INestApplication } from "@nestjs/common"
import type { OpenAPIObject } from "@nestjs/swagger"
import type { Express, NextFunction, Request, RequestHandler, Response } from "express"

const LOGIN_PATH = "/docs/login"
const DOCS_PATH = "/docs"

/**
 * CSP da UI do Scalar (aplicado após o gate): o Scalar carrega o runtime do
 * jsdelivr + um script inline de bootstrap, e puxa fontes do Google Fonts.
 * Escopado a esta rota — não relaxa o helmet do resto do app.
 */
const DOCS_UI_CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' https://cdn.jsdelivr.net; " +
  "worker-src 'self' blob:"

/** Tematização da marca no Scalar: acento sage/oliva + fonte Montserrat. */
const DOCS_SCALAR_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
:root { --scalar-font: 'Montserrat', system-ui, sans-serif; }
.light-mode {
  --scalar-color-accent: #485f2e;
  --scalar-background-accent: rgba(92, 122, 58, 0.12);
}
.dark-mode {
  --scalar-color-accent: #8fac5f;
  --scalar-background-accent: rgba(143, 172, 95, 0.14);
}`

/** Lê um campo string do body de form (urlencoded); ausente/não-string → "". */
function readField(body: unknown, key: string): string {
  if (body !== null && typeof body === "object" && key in body) {
    const value = (body as Record<string, unknown>)[key]
    if (typeof value === "string") {
      return value
    }
  }
  return ""
}

/** Só aceita retorno para dentro do próprio /docs — barra open redirect. */
function safeRedirect(value: unknown): string {
  if (
    typeof value === "string" &&
    value.startsWith("/docs") &&
    !value.startsWith("/docs/login")
  ) {
    return value
  }
  return DOCS_PATH
}

/**
 * Anti-CSRF do POST das docs: o host do Origin (fallback Referer) tem de bater
 * com o Host de destino do próprio pedido. Navegador não deixa página de outro
 * site forjar Origin; sem nenhum dos dois cabeçalhos, recusa. Só host (não
 * protocolo): atrás de proxy o protocolo percebido diverge do externo.
 */
function isSameOrigin(req: Request): boolean {
  const source = req.get("origin") ?? req.get("referer")
  if (source === undefined || source === "") {
    return false
  }
  try {
    return new URL(source).host === req.get("host")
  } catch {
    return false
  }
}

/**
 * Protege o `/docs` com uma tela de login própria, servida pela API.
 *
 * O `SwaggerModule.setup` monta o `/docs` como rota express crua, fora do
 * pipeline de guards do Nest — então o `AuthGuard` global NÃO o cobre. Aqui
 * registramos, na instância express e ANTES do setup das docs:
 *   - `GET /docs/login`  → renderiza a tela;
 *   - `POST /docs/login` → autentica via LoginUseCase e emite o cookie de sessão;
 *   - `use(/docs)`       → gate que valida o cookie e redireciona ao login.
 *
 * O POST reusa o LoginUseCase (lockout, rate-limit, auditoria) por fora dos
 * controllers de propósito: o CsrfGuard global exige Origin === WEB_ORIGIN, o
 * que bloquearia um POST partindo da própria origem das docs. No lugar do
 * guard, o handleLogin confere Origin/Referer contra o Host do próprio pedido
 * (isSameOrigin) — mesmo efeito anti-CSRF sem valor de configuração novo.
 *
 * Quem passa pelo gate cai na UI do Scalar (renderizada aqui, com o spec inline
 * e a marca aplicada). Deve ser chamado depois do middleware de RequestContext
 * (o LoginUseCase depende do ALS).
 */
export function setupDocsAuth(app: INestApplication, document: OpenAPIObject): void {
  const server = app.getHttpAdapter().getInstance() as unknown as Express
  const sessions = app.get<SessionRepository>(SESSION_REPOSITORY, {
    strict: false,
  })
  const tokens = app.get<TokenGenerator>(TOKEN_GENERATOR, { strict: false })
  const clock = app.get<Clock>(CLOCK, { strict: false })
  const config = app.get<IdentityConfig>(IDENTITY_CONFIG, { strict: false })
  const loginUseCase = app.get(LoginUseCase, { strict: false })
  const logger = app
    .get(LoggerFactory, { strict: false })
    .forModule("docs-auth")

  function sendLoginPage(
    res: Response,
    status: number,
    redirect: string,
    error?: string,
  ): void {
    res.status(status)
    res.setHeader("Content-Security-Policy", DOCS_LOGIN_CSP)
    res.type("html").send(renderDocsLoginPage({ redirect, error }))
  }

  async function handleLogin(req: Request, res: Response): Promise<void> {
    const redirect = safeRedirect(readField(req.body, "redirect"))

    if (!isSameOrigin(req)) {
      sendLoginPage(res, 403, redirect, "Não foi possível autenticar. Tente novamente.")
      return
    }

    try {
      const result = await loginUseCase.execute({
        email: readField(req.body, "email").trim(),
        password: readField(req.body, "password"),
        rememberMe: readField(req.body, "rememberMe") === "on",
      })
      setSessionCookie(res, config, result.sessionToken, result.maxAgeSeconds)
      res.redirect(redirect)
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        sendLoginPage(res, 401, redirect, "E-mail ou senha inválidos.")
        return
      }
      logger.error("Falha inesperada no login das docs", {
        error: error instanceof Error ? error.message : String(error),
      })
      sendLoginPage(res, 500, redirect, "Erro interno. Tente novamente.")
    }
  }

  async function gate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const raw = (req.cookies as Record<string, string> | undefined)?.[
      config.COOKIE_NAME
    ]
    const back = `${LOGIN_PATH}?redirect=${encodeURIComponent(req.originalUrl)}`

    if (raw === undefined || raw === "") {
      res.redirect(back)
      return
    }

    let session: Awaited<ReturnType<SessionRepository["findByTokenHash"]>>
    try {
      session = await sessions.findByTokenHash(tokens.hashOf(raw))
    } catch {
      // FAIL-CLOSED: banco indisponível nunca libera as docs.
      res.redirect(back)
      return
    }

    if (
      session === null ||
      session.isExpired(
        clock.now(),
        config.SESSION_IDLE_TTL_SECONDS,
        config.SESSION_ABSOLUTE_TTL_SECONDS,
      )
    ) {
      res.redirect(back)
      return
    }

    next()
  }

  server.get(LOGIN_PATH, (req, res) => {
    sendLoginPage(res, 200, safeRedirect(req.query.redirect))
  })

  // urlencoded próprio: estas rotas são registradas antes do body-parser global
  // do Nest (instalado no listen), então o parser não roda nelas sozinho.
  server.post(LOGIN_PATH, express.urlencoded({ extended: false }), (req, res) => {
    void handleLogin(req, res)
  })

  server.use(DOCS_PATH, (req, res, next) => {
    void gate(req, res, next)
  })

  // Pós-gate: CSP da UI do Scalar e render da referência (spec inline).
  server.use(DOCS_PATH, (_req, res, next) => {
    res.setHeader("Content-Security-Policy", DOCS_UI_CSP)
    next()
  })
  server.use(
    DOCS_PATH,
    apiReference({
      content: document,
      customCss: DOCS_SCALAR_CSS,
    }) as unknown as RequestHandler,
  )
}
