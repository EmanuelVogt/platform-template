import request from "supertest"

import { E2E_ORIGIN } from "../../../shared/test/e2e/constants"

import type { INestApplication } from "@nestjs/common"

/** Cria uma tag via HTTP (não há atalho de persistência: a central de tags
 *  não expõe um bypass de banco) e devolve o id. */
export async function seedTag(
  app: INestApplication,
  cookie: string[],
  name: string,
  isActive = true
): Promise<string> {
  const server = app.getHttpServer() as Parameters<typeof request>[0]
  const res = await request(server)
    .post("/v1/admin/tags")
    .set("Origin", E2E_ORIGIN)
    .set("Cookie", cookie)
    .send({ name, isActive })
    .expect(201)
  return res.body.id as string
}
