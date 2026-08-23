import "reflect-metadata"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { ListQuery } from "./list-query.decorator"

/** `@nestjs/swagger` DECORATORS.API_PARAMETERS — não exportada publicamente. */
const API_PARAMETERS = "swagger/apiParameters"

function handlerOf<T extends object, K extends keyof T>(
  proto: T,
  name: K
): T[K] {
  return proto[name]
}

type RecordedParam = { name: string; in: string; required: boolean }

describe("ListQuery", () => {
  class Fixture {
    @ListQuery(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        name: z.string(),
        q: z.string().trim().min(1).optional(),
      })
    )
    withRequiredField(): void {
      return
    }

    @ListQuery(z.object({}))
    withoutFields(): void {
      return
    }
  }

  it("documenta um campo obrigatório e dois opcionais/default como parâmetros de query", () => {
    const params = Reflect.getMetadata(
      API_PARAMETERS,
      handlerOf(Fixture.prototype, "withRequiredField")
    ) as RecordedParam[]

    expect(
      params.map((param) => [param.name, param.in, param.required])
    ).toEqual([
      ["page", "query", false],
      ["name", "query", true],
      ["q", "query", false],
    ])
  })

  it("schema sem campo obrigatório não grava nenhum parâmetro como required", () => {
    const params = Reflect.getMetadata(
      API_PARAMETERS,
      handlerOf(Fixture.prototype, "withoutFields")
    ) as RecordedParam[] | undefined

    expect(params).toBeUndefined()
  })
})
