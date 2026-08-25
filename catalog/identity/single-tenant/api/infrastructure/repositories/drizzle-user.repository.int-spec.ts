import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { User } from "../../domain/entities/user.entity"
import { VerificationToken } from "../../domain/entities/verification-token.entity"
import { users } from "../tables/user.table"

import { DrizzleUserRepository } from "./drizzle-user.repository"
import { DrizzleVerificationTokenRepository } from "./drizzle-verification-token.repository"

import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { Pool } from "pg"

function makeUser(email: string): User {
  return User.createActive({
    name: "Fulano",
    email,
    passwordHash: "$argon2id$fake",
    pepperVersion: 1,
  })
}

describe("DrizzleUserRepository (int)", () => {
  let pool: Pool
  let repo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("insert e findByEmail fazem round-trip", async () => {
    const user = makeUser("alice@example.com")
    await repo.insert(user)
    const found = await repo.findByEmail("alice@example.com")
    expect(found).not.toBeNull()
    expect(found?.props.email).toBe("alice@example.com")
  })
  it("findByEmail retorna null para e-mail inexistente", async () => {
    expect(await repo.findByEmail("ninguem@example.com")).toBeNull()
  })

  it("update persiste lockout (failedLoginAttempts + lockedUntil)", async () => {
    const user = makeUser("bob@example.com")
    await repo.insert(user)
    const lockedUntil = new Date(Date.now() + 60_000)
    const locked = User.fromProps({
      ...user.props,
      failedLoginAttempts: 5,
      lockedUntil,
    })
    await repo.update(locked)
    const found = await repo.findById(user.props.id)
    expect(found?.props.failedLoginAttempts).toBe(5)
    expect(found?.props.lockedUntil?.getTime()).toBe(lockedUntil.getTime())
  })

  it("lastResetRequestedAt: novo usuário é null e update persiste (cooldown)", async () => {
    const user = makeUser("carol@example.com")
    await repo.insert(user)
    const fresh = await repo.findByEmail("carol@example.com")
    expect(fresh?.props.lastResetRequestedAt).toBeNull()

    const requestedAt = new Date(Date.now() - 30_000)
    const touched = User.fromProps({
      ...fresh!.props,
      lastResetRequestedAt: requestedAt,
    })
    await repo.update(touched)
    const found = await repo.findById(user.props.id)
    expect(found?.props.lastResetRequestedAt?.getTime()).toBe(
      requestedAt.getTime()
    )
  })

  it("lastVerificationRequestedAt persiste independente do lastResetRequestedAt", async () => {
    const user = makeUser("dave@example.com")
    await repo.insert(user)
    const verifiedAt = new Date(Date.now() - 30_000)
    const touched = User.fromProps({
      ...user.props,
      lastVerificationRequestedAt: verifiedAt,
    })
    await repo.update(touched)
    const found = await repo.findById(user.props.id)
    expect(found?.props.lastVerificationRequestedAt?.getTime()).toBe(
      verifiedAt.getTime()
    )
    expect(found?.props.lastResetRequestedAt).toBeNull()
  })
})

describe("DrizzleUserRepository.registerFailedAttempt (concorrência)", () => {
  let pool: Pool
  let db: DrizzleDb
  let txm: TransactionManager
  let repo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  async function seedUser(): Promise<string> {
    const user = makeUser("lock@example.com")
    await repo.insert(user)
    return user.props.id
  }

  it("N=threshold tentativas concorrentes travam a conta (sem lost-update)", async () => {
    const id = await seedUser()
    const now = new Date()

    await Promise.all(
      Array.from({ length: 5 }, () =>
        txm.run(() => repo.registerFailedAttempt(id, now, 5, 900))
      )
    )

    const rows = await db.select().from(users).where(eq(users.id, id))
    expect(rows[0]?.failedLoginAttempts).toBe(5)
    expect(rows[0]?.lockedUntil).not.toBeNull()
  })

  it("N<threshold incrementa mas não trava", async () => {
    const id = await seedUser()
    const now = new Date()

    await Promise.all(
      Array.from({ length: 4 }, () =>
        txm.run(() => repo.registerFailedAttempt(id, now, 5, 900))
      )
    )

    const rows = await db.select().from(users).where(eq(users.id, id))
    expect(rows[0]?.failedLoginAttempts).toBe(4)
    expect(rows[0]?.lockedUntil).toBeNull()
  })

  it("retorna null quando o user não existe", async () => {
    await expect(
      txm.run(() =>
        repo.registerFailedAttempt("inexistente", new Date(), 5, 900)
      )
    ).resolves.toBeNull()
  })
})

describe("DrizzleUserRepository.list (paginação/sort/filtro/search)", () => {
  let pool: Pool
  let db: DrizzleDb
  let repo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  type SeedSpec = {
    id: string
    name: string
    email: string
    emailVerified?: boolean
    accessProfile?: "master" | "admin"
    createdAt: Date
  }

  async function seed(rows: SeedSpec[]): Promise<void> {
    await db.insert(users).values(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        passwordHash: "$argon2id$fake",
        emailVerified: r.emailVerified ?? true,
        accessProfile: r.accessProfile ?? "admin",
        createdAt: r.createdAt,
      }))
    )
  }

  const DATASET: SeedSpec[] = [
    {
      id: "u-1",
      name: "Ana",
      email: "ana@example.com",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "u-2",
      name: "Bruno",
      email: "bruno@example.com",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    {
      id: "u-3",
      name: "Carlos",
      email: "carlos@example.com",
      emailVerified: false,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
    },
    {
      id: "u-4",
      name: "Diana",
      email: "diana@example.com",
      accessProfile: "master",
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    },
    {
      id: "u-5",
      name: "Eva",
      email: "eva@example.com",
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
    },
  ]

  it("default sort createdAt desc + paginação (página 1)", async () => {
    await seed(DATASET)
    const r = await repo.list({ page: 1, pageSize: 2 })
    expect(r.data.map((u) => u.user.props.name)).toEqual(["Eva", "Diana"])
    expect(r.page).toEqual({ total: 5, page: 1, pageSize: 2, totalPages: 3 })
  })

  it("última página devolve o resto", async () => {
    await seed(DATASET)
    const r = await repo.list({ page: 3, pageSize: 2 })
    expect(r.data.map((u) => u.user.props.name)).toEqual(["Ana"])
    expect(r.page.total).toBe(5)
  })

  it("página além do fim: data vazia, total preservado", async () => {
    await seed(DATASET)
    const r = await repo.list({ page: 99, pageSize: 10 })
    expect(r.data).toEqual([])
    expect(r.page.total).toBe(5)
  })

  it("sort por name asc e desc", async () => {
    await seed(DATASET)
    const asc = await repo.list({
      page: 1,
      pageSize: 50,
      sort: "name",
      order: "asc",
    })
    expect(asc.data.map((u) => u.user.props.name)).toEqual([
      "Ana",
      "Bruno",
      "Carlos",
      "Diana",
      "Eva",
    ])
    const desc = await repo.list({
      page: 1,
      pageSize: 50,
      sort: "name",
      order: "desc",
    })
    expect(desc.data.map((u) => u.user.props.name)).toEqual([
      "Eva",
      "Diana",
      "Carlos",
      "Bruno",
      "Ana",
    ])
  })

  it("filtro emailVerified=false", async () => {
    await seed(DATASET)
    const r = await repo.list({ page: 1, pageSize: 50, emailVerified: false })
    expect(r.data.map((u) => u.user.props.name)).toEqual(["Carlos"])
    expect(r.page.total).toBe(1)
  })

  it("search ILIKE OR sobre nome e email (case-insensitive)", async () => {
    await seed(DATASET)
    const r = await repo.list({ page: 1, pageSize: 50, q: "ana" })
    expect(r.data.map((u) => u.user.props.name).sort()).toEqual([
      "Ana",
      "Diana",
    ])
  })

  it("search por email", async () => {
    await seed(DATASET)
    const r = await repo.list({ page: 1, pageSize: 50, q: "bruno@example" })
    expect(r.data.map((u) => u.user.props.name)).toEqual(["Bruno"])
  })

  it("search sem match: total=0 e totalPages=0", async () => {
    await seed(DATASET)
    const r = await repo.list({ page: 1, pageSize: 50, q: "zzz-inexistente" })
    expect(r.data).toEqual([])
    expect(r.page).toEqual({ total: 0, page: 1, pageSize: 50, totalPages: 0 })
  })

  it("escapa metacaractere LIKE no search (% não vira coringa)", async () => {
    await seed([
      {
        id: "p-1",
        name: "100% Ana",
        email: "promo@example.com",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        id: "p-2",
        name: "100X Bruno",
        email: "x@example.com",
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    ])
    const r = await repo.list({ page: 1, pageSize: 50, q: "100%" })
    expect(r.data.map((u) => u.user.props.name)).toEqual(["100% Ana"])
  })

  it("paginação estável com createdAt empatado (desempate por PK, sem dup/omissão)", async () => {
    const sameTime = new Date("2026-03-01T00:00:00.000Z")
    await seed([
      { id: "t-1", name: "T1", email: "t1@example.com", createdAt: sameTime },
      { id: "t-2", name: "T2", email: "t2@example.com", createdAt: sameTime },
      { id: "t-3", name: "T3", email: "t3@example.com", createdAt: sameTime },
    ])
    const collected: string[] = []
    for (let page = 1; page <= 3; page++) {
      const r = await repo.list({
        page,
        pageSize: 1,
        sort: "createdAt",
        order: "desc",
      })
      collected.push(...r.data.map((u) => u.user.props.id))
    }
    expect(collected.sort()).toEqual(["t-1", "t-2", "t-3"])
    expect(new Set(collected).size).toBe(3)
  })
})

describe("DrizzleUserRepository.list (access-link state / status filter)", () => {
  let pool: Pool
  let db: DrizzleDb
  let repo: DrizzleUserRepository
  let tokensRepo: DrizzleVerificationTokenRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
    tokensRepo = new DrizzleVerificationTokenRepository(txm)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  it("pending com token válido: accessLinkExpiresAt preenchido, accessLinkExpired = false", async () => {
    const user = User.create({
      name: "Criado",
      email: "pendente-valido@example.com",
      accessProfile: "admin",
    })
    await repo.insert(user)
    const expiresAt = new Date(Date.now() + 3_600_000)
    await tokensRepo.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: user.props.id,
        tokenHash: "hash-valido",
        type: "access_link",
        expiresAt,
        consumedAt: null,
        createdAt: new Date(),
      })
    )
    const r = await repo.list({ page: 1, pageSize: 50 })
    expect(r.data).toHaveLength(1)
    const row = r.data[0]
    expect(row!.accessLinkExpired).toBe(false)
    expect(row!.accessLinkExpiresAt?.getTime()).toBe(expiresAt.getTime())
  })

  it("pending com token expirado: accessLinkExpiresAt = null, accessLinkExpired = true", async () => {
    const user = User.create({
      name: "Expirado",
      email: "pendente-expirado@example.com",
      accessProfile: "admin",
    })
    await repo.insert(user)
    await tokensRepo.create(
      VerificationToken.fromProps({
        id: ulid(),
        userId: user.props.id,
        tokenHash: "hash-expirado",
        type: "access_link",
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
        createdAt: new Date(),
      })
    )
    const r = await repo.list({ page: 1, pageSize: 50 })
    expect(r.data).toHaveLength(1)
    const row = r.data[0]
    expect(row!.accessLinkExpired).toBe(true)
    expect(row!.accessLinkExpiresAt).toBeNull()
  })

  it("pending sem token: accessLinkExpiresAt = null, accessLinkExpired = true", async () => {
    const user = User.create({
      name: "Sem token",
      email: "pendente-sem-token@example.com",
      accessProfile: "admin",
    })
    await repo.insert(user)
    const r = await repo.list({ page: 1, pageSize: 50 })
    expect(r.data).toHaveLength(1)
    const row = r.data[0]
    expect(row!.accessLinkExpired).toBe(true)
    expect(row!.accessLinkExpiresAt).toBeNull()
  })

  it("filtro status='pending' retorna só os pending", async () => {
    const activeUser = User.createActive({
      name: "Ativo",
      email: "ativo@example.com",
      passwordHash: "$argon2id$fake",
      pepperVersion: 1,
    })
    const pendingUser = User.create({
      name: "Pendente",
      email: "pendente@example.com",
      accessProfile: "admin",
    })
    await repo.insert(activeUser)
    await repo.insert(pendingUser)
    const r = await repo.list({ page: 1, pageSize: 50, status: "pending" })
    expect(r.page.total).toBe(1)
    expect(r.data[0]!.user.props.status).toBe("pending")
  })

  it("filtro status='active' retorna só os active", async () => {
    const activeUser = User.createActive({
      name: "Ativo",
      email: "ativo@example.com",
      passwordHash: "$argon2id$fake",
      pepperVersion: 1,
    })
    const pendingUser = User.create({
      name: "Pendente",
      email: "pendente@example.com",
      accessProfile: "admin",
    })
    await repo.insert(activeUser)
    await repo.insert(pendingUser)
    const r = await repo.list({ page: 1, pageSize: 50, status: "active" })
    expect(r.page.total).toBe(1)
    expect(r.data[0]!.user.props.status).toBe("active")
  })

  it("sanity: active → accessLinkExpiresAt = null, accessLinkExpired = false", async () => {
    const user = User.createActive({
      name: "Ativo",
      email: "ativo-sanity@example.com",
      passwordHash: "$argon2id$fake",
      pepperVersion: 1,
    })
    await repo.insert(user)
    const r = await repo.list({ page: 1, pageSize: 50 })
    expect(r.data).toHaveLength(1)
    const row = r.data[0]
    expect(row!.accessLinkExpired).toBe(false)
    expect(row!.accessLinkExpiresAt).toBeNull()
  })
})

describe("DrizzleUserRepository (soft delete — hard gate)", () => {
  let pool: Pool
  let repo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  async function insertDeleted(email: string): Promise<User> {
    const user = makeUser(email)
    await repo.insert(user)
    await repo.update(user.delete(new Date()))
    return user
  }

  it("list oculta usuários soft-deleted", async () => {
    await insertDeleted("excluido@example.com")
    await repo.insert(makeUser("ativo@example.com"))
    const r = await repo.list({ page: 1, pageSize: 50 })
    expect(r.data.map((u) => u.user.props.email)).toEqual(["ativo@example.com"])
    expect(r.page.total).toBe(1)
  })

  it("findVisibleById oculta soft-deleted; findById (integridade) ainda enxerga", async () => {
    const user = await insertDeleted("excluido@example.com")
    expect(await repo.findVisibleById(user.props.id)).toBeNull()
    expect((await repo.findById(user.props.id))?.isDeleted()).toBe(true)
  })

  it("findByEmail (integridade) enxerga soft-deleted — unique-email/reativação", async () => {
    const user = await insertDeleted("excluido@example.com")
    const found = await repo.findByEmail("excluido@example.com")
    expect(found?.props.id).toBe(user.props.id)
    expect(found?.isDeleted()).toBe(true)
  })

  it("list({deleted:true}) devolve só soft-deleted; default esconde", async () => {
    const alive = makeUser("viva@example.com")
    const dead = makeUser("morta@example.com").delete(new Date())
    await repo.insert(alive)
    await repo.insert(dead)

    const trash = await repo.list({ page: 1, pageSize: 10, deleted: true })
    expect(trash.data.map((r) => r.user.props.email)).toEqual([
      "morta@example.com",
    ])
    expect(trash.data[0]!.user.isDeleted()).toBe(true)

    const normal = await repo.list({ page: 1, pageSize: 10 })
    expect(normal.data.map((r) => r.user.props.email)).toEqual([
      "viva@example.com",
    ])
  })

  it("findByIds devolve os existentes (inclui soft-deleted); hardDeleteByIds remove a linha", async () => {
    const a = makeUser("a@example.com")
    const b = makeUser("b@example.com").delete(new Date())
    await repo.insert(a)
    await repo.insert(b)

    const found = await repo.findByIds([a.props.id, b.props.id, "nao-existe"])
    expect(found.map((u) => u.props.id).sort()).toEqual(
      [a.props.id, b.props.id].sort()
    )

    await repo.hardDeleteByIds([b.props.id])
    expect(await repo.findById(b.props.id)).toBeNull()
    expect(await repo.findById(a.props.id)).not.toBeNull()
  })

  it("list({deleted:true, sort:'deletedAt'}) ordena pelo instante da exclusão", async () => {
    const first = makeUser("a@example.com").delete(
      new Date("2026-06-01T00:00:00Z")
    )
    const second = makeUser("b@example.com").delete(
      new Date("2026-06-02T00:00:00Z")
    )
    await repo.insert(first)
    await repo.insert(second)

    const out = await repo.list({
      page: 1,
      pageSize: 10,
      deleted: true,
      sort: "deletedAt",
      order: "desc",
    })
    expect(out.data.map((r) => r.user.props.email)).toEqual([
      "b@example.com",
      "a@example.com",
    ])
  })
})

describe("DrizzleUserRepository (permissões do usuário)", () => {
  let pool: Pool
  let repo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("replacePermissions grava e findPermissions lê o set", async () => {
    const user = makeUser("ana-perm@example.com")
    await repo.insert(user)
    await repo.replacePermissions(user.props.id, [
      "admin.users.read",
      "admin.users.create",
    ])
    expect([...(await repo.findPermissions(user.props.id))].sort()).toEqual([
      "admin.users.create",
      "admin.users.read",
    ])
  })

  it("replacePermissions com set menor remove as ausentes (overwrite)", async () => {
    const user = makeUser("bia-perm@example.com")
    await repo.insert(user)
    await repo.replacePermissions(user.props.id, [
      "admin.users.read",
      "admin.users.create",
    ])
    await repo.replacePermissions(user.props.id, ["admin.users.read"])
    expect(await repo.findPermissions(user.props.id)).toEqual([
      "admin.users.read",
    ])
  })

  it("findByIdWithPermissions devolve user + set em 1 chamada", async () => {
    const user = makeUser("caio-perm@example.com")
    await repo.insert(user)
    await repo.replacePermissions(user.props.id, ["admin.users.read"])
    const found = await repo.findByIdWithPermissions(user.props.id)
    expect(found?.user.props.id).toBe(user.props.id)
    expect(found?.permissions).toEqual(["admin.users.read"])
  })

  it("findByIdWithPermissions com set vazio devolve permissions []", async () => {
    const user = makeUser("davi-perm@example.com")
    await repo.insert(user)
    const found = await repo.findByIdWithPermissions(user.props.id)
    expect(found?.permissions).toEqual([])
  })

  it("list devolve permissions por item", async () => {
    const user = makeUser("eva-perm@example.com")
    await repo.insert(user)
    await repo.replacePermissions(user.props.id, ["admin.users.read"])
    const { data } = await repo.list({ page: 1, pageSize: 50 })
    const row = data.find((r) => r.user.props.id === user.props.id)
    expect(row?.permissions).toEqual(["admin.users.read"])
  })
})

describe("DrizzleUserRepository.findNotificationTargetsByPermission", () => {
  const permission = "admin.tags.audit.read" as const
  let pool: Pool
  let repo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    const txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("inclui master sem a chave e quem tem a chave; exclui sem chave, pendente e excluído", async () => {
    const master = User.fromProps({
      ...makeUser("master@example.com").props,
      name: "Master",
      accessProfile: "master",
    })
    const withKey = User.fromProps({
      ...makeUser("com-chave@example.com").props,
      name: "Com Chave",
    })
    const withoutKey = User.fromProps({
      ...makeUser("sem-chave@example.com").props,
      name: "Sem Chave",
    })
    const pending = User.create({
      name: "Pendente",
      email: "pendente@example.com",
      accessProfile: "admin",
    })
    const deleted = User.fromProps({
      ...makeUser("excluido@example.com").props,
      name: "Excluido",
    })

    await repo.insert(master)
    await repo.insert(withKey)
    await repo.insert(withoutKey)
    await repo.insert(pending)
    await repo.insert(deleted)
    await repo.replacePermissions(withKey.props.id, [permission])
    await repo.replacePermissions(pending.props.id, [permission])
    await repo.replacePermissions(deleted.props.id, [permission])
    await repo.update(deleted.delete(new Date()))

    const targets = await repo.findNotificationTargetsByPermission(permission)
    expect(targets.map((t) => t.email).sort()).toEqual([
      "com-chave@example.com",
      "master@example.com",
    ])
    expect(targets).toEqual(
      expect.arrayContaining([
        {
          id: master.props.id,
          email: "master@example.com",
          name: "Master",
        },
        {
          id: withKey.props.id,
          email: "com-chave@example.com",
          name: "Com Chave",
        },
      ])
    )
  })

  it("não duplica quando o master também tem a chave", async () => {
    const master = User.fromProps({
      ...makeUser("master@example.com").props,
      name: "Master",
      accessProfile: "master",
    })
    await repo.insert(master)
    await repo.replacePermissions(master.props.id, [permission])

    const targets = await repo.findNotificationTargetsByPermission(permission)
    expect(targets).toEqual([
      {
        id: master.props.id,
        email: "master@example.com",
        name: "Master",
      },
    ])
  })
})

describe("DrizzleUserRepository.findByIdForUpdate", () => {
  let pool: Pool
  let db: DrizzleDb
  let txm: TransactionManager
  let repo: DrizzleUserRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new DrizzleUserRepository(txm)
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it("enxerga linha soft-deleted (sem filtro de visibilidade)", async () => {
    const user = makeUser("apagado@example.com")
    await repo.insert(user)
    await repo.update(user.delete(new Date()))

    const found = await txm.run(() => repo.findByIdForUpdate(user.props.id))

    expect(found).not.toBeNull()
    expect(found?.isDeleted()).toBe(true)
  })

  it("desligamento commitado após o snapshot aparece na releitura da tx", async () => {
    const user = makeUser("desligado@example.com")
    await repo.insert(user)
    const snapshot = await repo.findById(user.props.id)
    expect(snapshot?.isDeleted()).toBe(false)

    await repo.update(user.delete(new Date()))

    await txm.run(async () => {
      const fresh = await repo.findByIdForUpdate(user.props.id)
      expect(fresh?.isDeleted()).toBe(true)
    })
  })
})
