import { join } from "node:path"

import { Injectable, Module } from "@nestjs/common"
import { ulid } from "ulid"
import { z } from "zod"

import { RATE_LIMITER } from "../../../../src/modules/identity/domain/ports/rate-limiter"
import { NotificationRequested } from "../api/events/notification-requested.event"
import { defineCatalogEntry } from "../application/catalog/notification-catalog"
import { NotificationTemplateSourceRegistry } from "../application/templates/notification-template-registry"
import { MAILER } from "../domain/ports/mailer"
import { DeliveryDispatcher } from "../infrastructure/delivery/delivery.dispatcher"
import { NotificationModule } from "../notification.module"
import { buildJobContextStore } from "../../../../src/shared/kernel/context/job-context"
import { RequestContext } from "../../../../src/shared/kernel/context/request-context"
import { OutboxDispatcher } from "../../../../src/shared/kernel/outbox/outbox.dispatcher"
import { OutboxPublisher } from "../../../../src/shared/kernel/outbox/outbox.publisher"
import { TransactionManager } from "../../../../src/shared/kernel/transactional/transaction-manager"

import { allowAllRateLimiter, createE2eApp } from "../../../../test/setup/app-factory"
import { fakeMailer } from "../testing/fake-mailer"
import { createTestPool, truncateIdentity, truncateKernel } from "../../../../test/setup/test-db"

import type { INestApplication, OnModuleInit } from "@nestjs/common"

declare module "../api/events/notification-requested.event" {
  interface NotificationTypeRegistry {
    sampleProduct: "sample_welcome"
  }
}

/** Simula um produto registrando o próprio tipo de e-mail (KPB-07), sem editar
 *  nenhum arquivo da plataforma: template e assunto vêm do módulo dono. */
@Injectable()
class FakeProductNotificationSource implements OnModuleInit {
  constructor(private readonly registry: NotificationTemplateSourceRegistry) {}

  onModuleInit(): void {
    this.registry.register({
      type: "sample_welcome",
      catalog: defineCatalogEntry({
        category: "transactional",
        channels: ["email"],
        dataSchema: z.object({ email: z.email(), name: z.string().min(1) }),
      }),
      email: {
        template: "sample-welcome",
        templateDir: join(__dirname, "fixtures", "sample-templates"),
        subject: (data) => `Bem-vindo, ${String(data.name)}`,
      },
    })
  }
}

@Module({
  imports: [NotificationModule],
  providers: [FakeProductNotificationSource],
})
class FakeProductModule {}

describe("Produto registra um tipo de e-mail ponta a ponta (e2e)", () => {
  let app: INestApplication
  let mailer: ReturnType<typeof fakeMailer>

  beforeAll(async () => {
    const pool = createTestPool()
    await truncateIdentity(pool)
    await truncateKernel(pool)
    await pool.query(
      "truncate table notification.notifications, notification.notification_deliveries",
    )
    await pool.end()

    mailer = fakeMailer()
    app = await createE2eApp(
      (b) =>
        b
          .overrideProvider(RATE_LIMITER)
          .useValue(allowAllRateLimiter)
          .overrideProvider(MAILER)
          .useValue(mailer),
      [FakeProductModule],
    )
  })

  afterAll(async () => {
    await app.close()
  })

  it("sample_welcome renderiza o template do produto no layout compartilhado e entrega por e-mail", async () => {
    const email = "ana-produto@example.com"
    const name = "Ana"

    await app.get(RequestContext).run(buildJobContextStore(), () =>
      app.get(TransactionManager).run(() =>
        app.get(OutboxPublisher).publish(
          NotificationRequested.from({
            recipientId: ulid(),
            type: "sample_welcome",
            locale: "pt-BR",
            data: { email, name },
          }),
        ),
      ),
    )

    const pool = createTestPool()
    const findSent = async (): Promise<{ id: string } | undefined> => {
      await app.get(OutboxDispatcher).poll()
      await app.get(DeliveryDispatcher).poll()
      const r = await pool.query<{ id: string; status: string }>(
        "select id, status from notification.notification_deliveries where type = 'sample_welcome'",
      )
      return r.rows[0]?.status === "sent" ? r.rows[0] : undefined
    }
    let delivery = await findSent()
    const start = Date.now()
    while (!delivery) {
      if (Date.now() - start > 8000) {
        throw new Error("timeout esperando a delivery de sample_welcome virar sent")
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      delivery = await findSent()
    }

    const message = mailer.sent.find((m) => m.to === email)
    expect(message?.to).toBe(email)
    expect(message?.subject).toBe(`Bem-vindo, ${name}`)
    expect(message?.html).toContain(name)
    expect(message?.idempotencyKey).toBe(delivery.id)

    await pool.end()
  })
})
