import { applyDecorators, Injectable, SetMetadata } from "@nestjs/common"

export const USE_CASE_METADATA = "kernel:use-case"

/** Marca a classe como use case (provider injetável + metadado de varredura). */
export function UseCase(): ClassDecorator {
  return applyDecorators(Injectable(), SetMetadata(USE_CASE_METADATA, true))
}
