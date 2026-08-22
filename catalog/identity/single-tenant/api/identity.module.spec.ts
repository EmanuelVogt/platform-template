import "reflect-metadata"

import { Test } from "@nestjs/testing"

import { CLOCK } from "../../shared/kernel/clock/clock"
import { RequestContext } from "../../shared/kernel/context/request-context"
import { LoggerFactory } from "../../shared/kernel/logging/logger.factory"
import { RateLimitModule } from "../../shared/kernel/rate-limit/rate-limit.module"

import { UploadAccessLinkAvatarUseCase } from "./application/use-cases/upload-access-link-avatar/upload-access-link-avatar.use-case"
import { UploadAvatarUseCase } from "./application/use-cases/upload-avatar/upload-avatar.use-case"
import { TOKEN_GENERATOR } from "./domain/ports/token-generator"
import { USER_REPOSITORY } from "./domain/ports/user.repository"
import { VERIFICATION_TOKEN_REPOSITORY } from "./domain/ports/verification-token.repository"
import { IdentityModule } from "./identity.module"

const NOW = new Date("2026-06-16T00:00:00.000Z")

const STUBS = [
  RequestContext,
  {
    provide: USER_REPOSITORY,
    useValue: {
      findById: () => Promise.resolve(null),
      update: () => Promise.resolve(undefined),
    },
  },
  {
    provide: VERIFICATION_TOKEN_REPOSITORY,
    useValue: { findActiveByHash: () => Promise.resolve(null) },
  },
  { provide: TOKEN_GENERATOR, useValue: { hashOf: (raw: string) => raw } },
  { provide: CLOCK, useValue: { now: () => NOW } },
  {
    provide: LoggerFactory,
    useValue: {
      forModule: () => ({
        warn: () => undefined,
        info: () => undefined,
        error: () => undefined,
      }),
    },
  },
]

describe("identidade instalada sozinha, sem o módulo de anexos", () => {
  it("sem slot profissional, o IdentityModule importa apenas RateLimitModule", () => {
    expect(IdentityModule.forRoot().imports).toEqual([RateLimitModule])
  })

  it("os casos de uso de imagem resolvem sem nenhum provider de PROFILE_IMAGE_STORE", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UploadAvatarUseCase, UploadAccessLinkAvatarUseCase, ...STUBS],
    }).compile()

    expect(moduleRef.get(UploadAvatarUseCase)).toBeInstanceOf(UploadAvatarUseCase)
    expect(moduleRef.get(UploadAccessLinkAvatarUseCase)).toBeInstanceOf(
      UploadAccessLinkAvatarUseCase,
    )
  })
})
