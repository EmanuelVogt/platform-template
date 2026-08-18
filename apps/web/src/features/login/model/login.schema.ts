import { loginDtoSchema } from "@platform/api-client/zod/loginDtoSchema"
import { z } from "zod"


/** Schema do form de login = body da API (`POST /auth/login`). O contrato aceita
 *  o e-mail como string crua; aqui validamos o formato no cliente (UX). */
export const loginSchema = loginDtoSchema.extend({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha.").max(256),
})

export type LoginInput = z.infer<typeof loginSchema>
