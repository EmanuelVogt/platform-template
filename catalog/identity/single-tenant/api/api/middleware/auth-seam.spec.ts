import "reflect-metadata"

import { Controller, Get, Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import cookieParser from "cookie-parser"
import request from "supertest"
import { afterAll, beforeAll, describe, it } from "vitest"

import { ACCESS_POLICY } from "../../../../shared/kernel/access/access-policy.port"
import { AccessGuard } from "../../../../shared/kernel/access/access.guard"
import {
  Public,
  RequirePermission,
} from "../../../../shared/kernel/access/decorators"
import { CLOCK } from "../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { createRequestContextMiddleware } from "../../../../shared/kernel/context/request-context.middleware"
import { Session } from "../../domain/entities/session.entity"
import { SESSION_REPOSITORY } from "../../domain/ports/session.repository"
import { TOKEN_GENERATOR } from "../../domain/ports/token-generator"
import { USER_REPOSITORY } from "../../domain/ports/user.repository"
import { IDENTITY_CONFIG } from "../../identity.config"
import { IdentityAccessPolicy } from "../access/identity-access.policy"

import { AUTH_MIDDLEWARE_ROUTE, AuthMiddleware } from "./auth.middleware"

import type { INestApplication, MiddlewareConsumer, NestModule } from "@nestjs/common"

const COOKIE_NAME = "__Host-rit_session"
const PERMISSION = "admin.users.read"

const cfg = {
  COOKIE_NAME,
  COOKIE_SECURE: false,
  COOKIE_SAMESITE: "lax" as const,
  SESSION_IDLE_TTL_SECONDS: 604800,
  SESSION_ABSOLUTE_TTL_SECONDS: 2592000,
  SESSION_TOUCH_INTERVAL_SECONDS: 60,
}

const NOW = new Date("2026-05-30T01:00:00Z")

@Controller("seam")
class SeamController {
  @Get("public")
  @Public()
  open(): { ok: true } {
    return { ok: true }
  }

  @Get("guarded")
  @RequirePermission(PERMISSION)
  guarded(): { ok: true } {
    return { ok: true }
  }
}

const session = Session.fromProps({
  id: "sess-1",
  userId: "user-1",
  tokenHash: "hash-of:raw",
  createdAt: NOW,
  lastSeenAt: NOW,
  expiresAt: new Date("2026-06-29T00:00:00Z"),
  rememberMe: true,
  ipAddress: null,
  userAgent: null,
  deviceId: null,
})

@Module({
  controllers: [SeamController],
  providers: [
    RequestContext,
    AuthMiddleware,
    { provide: ACCESS_POLICY, useClass: IdentityAccessPolicy },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: IDENTITY_CONFIG, useValue: cfg },
    { provide: CLOCK, useValue: { now: () => NOW } },
    {
      provide: TOKEN_GENERATOR,
      useValue: {
        generate: () => ({ raw: "", hash: "" }),
        hashOf: (raw: string) => `hash-of:${raw}`,
        safeEqual: () => true,
      },
    },
    {
      provide: SESSION_REPOSITORY,
      useValue: {
        findByTokenHash: (hash: string) =>
          Promise.resolve(hash === "hash-of:raw" ? session : null),
        touch: () => Promise.resolve(undefined),
      },
    },
    {
      provide: USER_REPOSITORY,
      useValue: {
        findByIdWithPermissions: () =>
          Promise.resolve({
            user: { isMaster: () => false, isDeleted: () => false },
            permissions: [PERMISSION],
          }),
      },
    },
  ],
})
class SeamModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AUTH_MIDDLEWARE_ROUTE)
  }
}

describe("seam de identidade — middleware antes do AccessGuard", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SeamModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.use(createRequestContextMiddleware(app.get(RequestContext)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("rota pública responde 200 sem sessão", async () => {
    await request(app.getHttpServer()).get("/seam/public").expect(200)
  })

  it("rota de permissão responde 200 com sessão — o middleware publicou o ator antes do guard", async () => {
    await request(app.getHttpServer())
      .get("/seam/guarded")
      .set("Cookie", `${COOKIE_NAME}=raw`)
      .expect(200, { ok: true })
  })

  it("rota de permissão responde 401 sem sessão", async () => {
    await request(app.getHttpServer()).get("/seam/guarded").expect(401)
  })

  it("rota de permissão responde 401 com cookie inválido", async () => {
    await request(app.getHttpServer())
      .get("/seam/guarded")
      .set("Cookie", `${COOKIE_NAME}=lixo`)
      .expect(401)
  })
})
