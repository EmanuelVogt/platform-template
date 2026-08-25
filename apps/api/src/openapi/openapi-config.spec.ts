import { Controller, Get, Post } from "@nestjs/common"
import { ModulesContainer } from "@nestjs/core"
import { ApiOperation } from "@nestjs/swagger"
import { Test } from "@nestjs/testing"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { Authenticated, Public } from "../shared/kernel/access/decorators"

import { buildOpenApiDocument } from "./openapi-config"

import type { INestApplication, Type } from "@nestjs/common"
import type { OpenAPIObject } from "@nestjs/swagger"

// Mesmo subset estrutural que o openapi-config usa: o OperationObject completo
// mora em deep path do @nestjs/swagger que o exports map não expõe no NodeNext.
type Operation = {
  operationId?: string
  summary?: string
  security?: unknown[]
}

type PathItem = Record<string, Operation | undefined>

@Controller("public-things")
class PublicThingsController {
  @Get()
  @ApiOperation({ operationId: "listPublicThings" })
  @Public()
  list(): string {
    return "list"
  }

  @Post()
  @ApiOperation({
    operationId: "createPublicThing",
    summary: "Cria uma coisa pública",
  })
  @Public()
  create(): string {
    return "create"
  }
}

@Controller("private-things")
class PrivateThingsController {
  @Get()
  @ApiOperation({ operationId: "listPrivateThings" })
  @Authenticated()
  list(): string {
    return "list"
  }
}

/** Requisito na classe, não no handler — exercita o fallback `??`. */
@Public()
@Controller("inherited-things")
class InheritedPublicController {
  @Get()
  @ApiOperation({ operationId: "listInheritedThings" })
  list(): string {
    return "list"
  }
}

/** Público, mas sem @ApiOperation: não entra no conjunto de operationIds. */
@Controller("anonymous-things")
class AnonymousOperationController {
  @Get()
  @Public()
  list(): string {
    return "list"
  }
}

/** Prototype só com `constructor` — nada a varrer. */
@Controller("empty-things")
class EmptyController {}

/** Prototype com membro que não é função (getter) ao lado do handler. */
@Controller("getter-things")
class GetterController {
  get label(): string {
    return `${GetterController.name}-label`
  }

  @Get()
  @ApiOperation({ operationId: "listGetterThings" })
  @Public()
  list(): string {
    return "list"
  }
}

async function createApp(
  controllers: Type<unknown>[]
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers }).compile()
  const app = moduleRef.createNestApplication()
  await app.init()
  return app
}

function operationAt(
  document: OpenAPIObject,
  path: string,
  method: string
): Operation {
  const item = document.paths[path] as PathItem | undefined
  const operation = item?.[method]
  if (!operation) {
    throw new Error(
      `operação ${method.toUpperCase()} ${path} ausente no documento`
    )
  }
  return operation
}

describe("buildOpenApiDocument", () => {
  let app: INestApplication
  let document: OpenAPIObject

  beforeAll(async () => {
    app = await createApp([
      PublicThingsController,
      PrivateThingsController,
      InheritedPublicController,
      AnonymousOperationController,
      EmptyController,
      GetterController,
    ])
    document = buildOpenApiDocument(app)
  })

  afterAll(async () => {
    await app.close()
  })

  describe("cabeçalho do documento", () => {
    it("declara título e versão da API", () => {
      expect(document.info.title).toBe("API")
      expect(document.info.version).toBe("1")
    })

    it("declara o cookie de sessão como security scheme apiKey", () => {
      expect(document.components?.securitySchemes?.cookie).toMatchObject({
        type: "apiKey",
        in: "cookie",
        name: "__Host-app_session",
      })
    })

    it("exige o cookie por default no documento inteiro", () => {
      expect(document.security).toEqual([{ cookie: [] }])
    })
  })

  describe("neutralidade de marca do contrato publicado (BRAND-01)", () => {
    it("documenta o default de COOKIE_NAME como __Host-app_session", () => {
      const scheme = document.components?.securitySchemes?.cookie as {
        description?: string
      }

      expect(scheme.description).toContain(
        "COOKIE_NAME (default __Host-app_session)"
      )
    })

    it("anuncia o cookie de sessão neutro na descrição do documento", () => {
      expect(document.info.description).toContain("`__Host-app_session`")
    })

    it("anuncia o cookie de CSRF como app_csrf", () => {
      expect(document.info.description).toContain("`app_csrf`")
    })

    it("não publica nenhum literal com o prefixo de marca do dono", () => {
      expect(JSON.stringify(document)).not.toMatch(/rit_|rit-|__Host-rit/)
    })

    // O token da entrada em si é varrido pela RULE C de
    // `module-boundaries.spec.ts`, que passou a enxergar este arquivo: repetir
    // o literal aqui reprovaria aquela varredura.
    it("descreve o provedor do CsrfGuard pela função, não pelo nome da entrada", () => {
      expect(document.info.description).toContain("da entrada de identidade")
    })
  })

  describe("security por operação", () => {
    it("abre com security vazio o handler @Public com operationId", () => {
      expect(operationAt(document, "/public-things", "get").security).toEqual(
        []
      )
    })

    it("abre também o método mutante público (post)", () => {
      expect(operationAt(document, "/public-things", "post").security).toEqual(
        []
      )
    })

    it("mantém o default do documento no handler não-público", () => {
      expect(
        operationAt(document, "/private-things", "get").security
      ).toBeUndefined()
      expect(document.security).toEqual([{ cookie: [] }])
    })

    it("herda o requisito público declarado na classe do controller", () => {
      expect(
        operationAt(document, "/inherited-things", "get").security
      ).toEqual([])
    })

    it("não abre handler público sem operationId declarado", () => {
      const operation = operationAt(document, "/anonymous-things", "get")

      expect(operation.operationId).toBe("AnonymousOperationController_list")
      expect(operation.security).toBeUndefined()
    })

    it("ignora membro do prototype que não é função ao coletar", () => {
      expect(operationAt(document, "/getter-things", "get").security).toEqual(
        []
      )
    })
  })

  describe("summary", () => {
    it("remove o summary vazio injetado pelo @ApiOperation", () => {
      expect(
        operationAt(document, "/public-things", "get").summary
      ).toBeUndefined()
    })

    it("preserva o summary declarado de verdade", () => {
      expect(operationAt(document, "/public-things", "post").summary).toBe(
        "Cria uma coisa pública"
      )
    })
  })

  describe("varredura de paths e controllers", () => {
    it("visita só os métodos presentes no path item", () => {
      const item = document.paths["/public-things"] as PathItem | undefined

      expect(Object.keys(item ?? {}).sort()).toEqual(["get", "post"])
    })

    it("controller sem handler não contribui path", () => {
      expect(Object.keys(document.paths).sort()).toEqual([
        "/anonymous-things",
        "/getter-things",
        "/inherited-things",
        "/private-things",
        "/public-things",
      ])
    })
  })
})

describe("buildOpenApiDocument — controllers malformados no container", () => {
  let app: INestApplication
  let wrappers: Map<string, { metatype: unknown; instance: unknown }>

  beforeAll(async () => {
    app = await createApp([PublicThingsController])
    // O container só carrega classes; os wrappers defensivos (metatype que não
    // é função, metatype sem prototype) são injetados à mão para exercitar os
    // guards de collectPublicOperationIds. `name` existe porque o scanner do
    // Swagger deriva a tag dele.
    const [firstModule] = [...app.get(ModulesContainer).values()]
    wrappers = firstModule?.controllers as unknown as Map<
      string,
      { metatype: unknown; instance: unknown }
    >
    wrappers.set("PlainObjectController", {
      metatype: { name: "PlainObjectController" },
      instance: {},
    })
    wrappers.set("PrototypelessController", {
      metatype: () => undefined,
      instance: {},
    })
  })

  afterAll(async () => {
    // O shutdown do Nest chama métodos de InstanceWrapper que os wrappers
    // sintéticos não têm; saem do container antes do close.
    wrappers.delete("PlainObjectController")
    wrappers.delete("PrototypelessController")
    await app.close()
  })

  it("pula os wrappers inválidos e ainda abre a rota pública", () => {
    const document = buildOpenApiDocument(app)

    expect(operationAt(document, "/public-things", "get").security).toEqual([])
    expect(Object.keys(document.paths)).toEqual(["/public-things"])
  })
})
