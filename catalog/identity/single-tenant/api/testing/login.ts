import { cookieHeader } from "../../../shared/test/e2e/http"
import { E2E_ORIGIN, TEST_PASSWORD } from "../../../shared/test/e2e/constants"

import type request from "supertest"

/**
 * Faz login e devolve os cookies da sessão, prontos para `.set("Cookie", …)`.
 * Devolve todos: sessão, device e csrf viajam juntos e um teste que leva só o
 * primeiro passa a depender da ordem em que o servidor os emite.
 */
export async function loginAs(
  http: ReturnType<typeof request>,
  email: string,
  password: string = TEST_PASSWORD
): Promise<string[]> {
  const res = await http
    .post("/v1/auth/login")
    .set("Origin", E2E_ORIGIN)
    .send({ email, password, rememberMe: true })
    .expect(200)
  return cookieHeader(res)
}
