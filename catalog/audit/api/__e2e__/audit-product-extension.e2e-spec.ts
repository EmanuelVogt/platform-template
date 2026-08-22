import { Injectable, Module } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createE2eApp } from "../../../../test/setup/app-factory"
import { setCookies } from "../../../../test/setup/cookies"
import {
  createTestPool,
  seedEmail,
  truncateIdentity,
  truncateKernel,
} from "../../../../test/setup/test-db"
import { RATE_LIMITER } from "../../../shared/kernel/rate-limit/rate-limiter.port"
import { allowAllRateLimiter } from "../../identity/testing/allow-all-rate-limiter"
import { seedUser } from "../../identity/testing/seed-user"
import { AuditRegistry } from "../application/services/audit-registry"
import { AuditModule } from "../audit.module"

import type { INestApplication, OnModuleInit } from "@nestjs/common"
import type { Pool } from "pg"

const ORIGIN = "http://localhost:5173"
const PASSWORD = "Senha-Produto-Audit-Muito-Forte-2026!"
const THING_ID = "thing-1"
const THING_NAME = "Widget de teste"

/** Simula um módulo de produto registrando uma tabela auditada nova
 *  (`sample.things`) e um alvo de FK (`thing_id`) no `AuditRegistry` do base
 *  set, sem editar nenhum arquivo da plataforma. */
@Injectable()
class FakeProductAuditRegistration implements OnModuleInit {
  constructor(private readonly registry: AuditRegistry) {}

  onModuleInit(): void {
    this.registry.registerTables([
      { schema: "sample", table: "things", owner: "admin.users.audit.read" },
    ])
    this.registry.registerRefTargets([
      {
        column: "thing_id",
        schema: "sample",
        table: "things",
        labelColumn: "name",
      },
    ])
  }
}

@Module({
  imports: [AuditModule],
  providers: [FakeProductAuditRegistration],
})
class FakeProductModule {}

async function seedThingAndAuditEntry(pool: Pool): Promise<void> {
  await pool.query("DROP SCHEMA IF EXISTS sample CASCADE")
  await pool.query("CREATE SCHEMA sample")
  await pool.query(
    "CREATE TABLE sample.things (id text PRIMARY KEY, name text NOT NULL)"
  )
  await pool.query("INSERT INTO sample.things (id, name) VALUES ($1, $2)", [
    THING_ID,
    THING_NAME,
  ])
  await pool.query(
    `INSERT INTO audit.entries
       (occurred_at, schema_name, table_name, entity_id, op, row_new, changed_keys, actor_user_id, origin, tx_id)
     VALUES (now(), 'sample', 'things', $1, 'insert', $2::jsonb, '{}', NULL, 'http', 1)`,
    [THING_ID, JSON.stringify({ name: THING_NAME, thing_id: THING_ID })]
  )
}

describe("Product registers audit metadata (e2e)", () => {
  let app: INestApplication
  let masterCookie: string[]
  let ownerCookie: string[]
  let noOwnerCookie: string[]

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await seedThingAndAuditEntry(pool)

    app = await createE2eApp(
      (b) => b.overrideProvider(RATE_LIMITER).useValue(allowAllRateLimiter),
      [FakeProductModule]
    )

    await seedUser(app, pool, {
      email: seedEmail("audit-product-ext", "master"),
      password: PASSWORD,
      accessProfile: "master",
    })
    await seedUser(app, pool, {
      email: seedEmail("audit-product-ext", "owner"),
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.users.audit.read"],
    })
    await seedUser(app, pool, {
      email: seedEmail("audit-product-ext", "no-owner"),
      password: PASSWORD,
      accessProfile: "admin",
      permissions: ["admin.tags.audit.read"],
    })
    await pool.end()

    masterCookie = await login(app, seedEmail("audit-product-ext", "master"))
    ownerCookie = await login(app, seedEmail("audit-product-ext", "owner"))
    noOwnerCookie = await login(app, seedEmail("audit-product-ext", "no-owner"))
  })

  afterAll(async () => {
    await app.close()
  })

  it("master lista a trilha da tabela do produto com o label da FK resolvido", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "things", entityId: THING_ID })
      .set("Origin", ORIGIN)
      .set("Cookie", masterCookie)
      .expect(200)

    const items = res.body.data as {
      tableName: string
      changes: Record<string, { new: unknown; newLabel: string | null }>
    }[]
    expect(items).toHaveLength(1)
    expect(items[0]?.tableName).toBe("things")
    expect(items[0]?.changes.thing_id?.newLabel).toBe(THING_NAME)
  })

  it("usuário com a chave dona registrada pelo produto lista a tabela", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "things", entityId: THING_ID })
      .set("Origin", ORIGIN)
      .set("Cookie", ownerCookie)
      .expect(200)

    const items = res.body.data as { tableName: string }[]
    expect(items).toHaveLength(1)
    expect(items[0]?.tableName).toBe("things")
  })

  it("usuário sem a chave dona registrada pelo produto recebe 403", async () => {
    await request(app.getHttpServer())
      .get("/v1/audit")
      .query({ table: "things" })
      .set("Origin", ORIGIN)
      .set("Cookie", noOwnerCookie)
      .expect(403)
  })
})

async function login(
  app: INestApplication,
  email: string
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post("/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: PASSWORD })
    .expect(200)
  return setCookies(res)
}
