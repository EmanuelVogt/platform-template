import { ulid } from "ulid"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { User } from "../../domain/entities/user.entity"

import { DrizzleUserRepository } from "./drizzle-user.repository"

import type { AccessProfile } from "../../../../shared/kernel/access/permission.types"
import type { Pool } from "pg"

// Perfil que só o produto registra: aqui ele entra pelo mesmo caminho que a
// migration do produto usaria (AD-004), sem transação e por conexão própria.
const PRODUCT_PROFILE = "sample" as AccessProfile

describe("DrizzleUserRepository — perfil de acesso do produto (int)", () => {
  let pool: Pool
  let repo: DrizzleUserRepository

  beforeAll(async () => {
    const alterPool = createTestPool()
    await alterPool.query(
      "ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS 'sample'"
    )
    await alterPool.end()

    pool = createTestPool()
    repo = new DrizzleUserRepository(
      new TransactionManager(createTestDb(pool), makeTestLogger().loggerFactory)
    )
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  function makeUser(): User {
    return User.fromProps({
      ...User.createActive({
        name: "Perfil de produto",
        email: `${ulid()}@example.com`,
        passwordHash: "$argon2id$fake",
        pepperVersion: 1,
      }).props,
      accessProfile: PRODUCT_PROFILE,
    })
  }

  it("insert e findById fazem round-trip do perfil registrado pelo produto", async () => {
    const user = makeUser()

    await repo.insert(user)

    const found = await repo.findById(user.props.id)
    expect(found?.props.accessProfile).toBe("sample")
  })

  it("a coluna access_profile guarda o valor acrescentado ao enum", async () => {
    const user = makeUser()

    await repo.insert(user)

    const rows = await pool.query(
      "SELECT access_profile FROM identity.users WHERE id = $1",
      [user.props.id]
    )
    expect(rows.rows).toEqual([{ access_profile: "sample" }])
  })
})
