import { applyDecorators } from "@nestjs/common"
import { ApiQuery, type ApiQueryOptions } from "@nestjs/swagger"
import { z } from "zod"

/**
 * Branch de `ApiQueryOptions` que carrega `schema` (o `ApiQuerySchemaHost`),
 * derivado sem o import profundo de `SchemaObject` de `dist/`.
 */
type QuerySchema = Extract<ApiQueryOptions, { schema: unknown }>["schema"]

/**
 * Documenta os query params de listagem na OpenAPI a partir do schema Zod do
 * contrato. Sem o plugin CLI do `@nestjs/swagger`, um `@Query(Dto)` não vira
 * `parameters[in:query]` per-campo — então emitimos um `@ApiQuery` por campo
 * derivado de `z.toJSONSchema`. É isso que faz o Kubb gerar `QueryParams` + hook
 * com params no cliente.
 *
 * `io: "input"` lê o lado de ENTRADA do schema (antes de coerções e transforms),
 * então `z.coerce.number()` aparece como integer e o `zBoolQuery` (enum→boolean)
 * aparece como o enum de strings que o cliente realmente manda.
 *
 * É só documentação: a validação/coerção continua no `ZodValidationPipe` global
 * via metatype do `@Query()` DTO. Por isso é um method decorator — o `@Query()`
 * fica no parâmetro do handler.
 */
export function ListQuery(schema: z.ZodObject<z.ZodRawShape>): MethodDecorator {
  const json = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as {
    // Sem `?`: `objectProcessor` (zod/v4/core/json-schema-processors.js) fixa
    // `json.properties = {}` incondicionalmente antes de povoar — para um
    // `ZodObject`, a chave nunca vem ausente. `required`, ao contrário, só é
    // emitida quando há ao menos uma chave obrigatória.
    properties: Record<string, QuerySchema>
    required?: string[]
  }
  const properties = json.properties
  const required = new Set(json.required ?? [])
  const params = Object.entries(properties).map(([name, propSchema]) =>
    ApiQuery({ name, required: required.has(name), schema: propSchema })
  )
  return applyDecorators(...params)
}
