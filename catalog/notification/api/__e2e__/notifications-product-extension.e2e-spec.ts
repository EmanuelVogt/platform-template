import { join } from "node:path"

import { Injectable, Module } from "@nestjs/common"
import { ulid } from "ulid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { buildJobContextStore } from "../../../shared/kernel/context/job-context"
import { RequestContext } from "../../../shared/kernel/context/request-context"
import { OutboxPublisher } from "../../../shared/kernel/outbox/outbox.publisher"
import { TransactionManager } from "../../../shared/kernel/transactional/transaction-manager"
import { createE2eApp, withE2ePool } from "../../../shared/test/e2e/app"
import { drainOutbox } from "../../../shared/test/e2e/outbox"
import { resetDb } from "../../../shared/test/int/db"
import { NotificationRequested } from "../api/events/notification-requested.event"
import { defineCatalogEntry } from "../application/catalog/notification-catalog"
import { NotificationTemplateSourceRegistry } from "../application/templates/notification-template-registry"
import { MAILER } from "../domain/ports/mailer"
import { NotificationModule } from "../notification.module"
import { DELIVERY_DISPATCHERS, fakeMailer, findSent } from "../testing"

import type { E2eApp } from "../../../shared/test/e2e/app"
import type { OnModuleInit } from "@nestjs/common"

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
        templateDir: join(__dirname, "..", "testing", "sample-templates"),
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
  const db = withE2ePool()
  let e2e: E2eApp
  let mailer: ReturnType<typeof fakeMailer>

  beforeAll(async () => {
    // SPEC_DEVIATION: sem o schema "identity" em resetDb — este e2e não depende
    // dele (recipientId é um ulid() solto, sem FK para identity.users, per
    // AD-025/5ef5e9e); passá-lo falha com schema "identity" does not exist
    // quando o filho renderizado só contém notification (catalog:check standalone).
    // Reason: o gate de DB tier por entrada (AC3) roda de fato e expôs a chamada
    // órfã deixada pelo refactor que tirou o e2e cruzado do notification.
    await resetDb(db.pool, ["_kernel", "notification"])
    mailer = fakeMailer()
    e2e = await createE2eApp({
      overrides: [[MAILER, mailer]],
      extraModules: [FakeProductModule],
    })
  })

  afterAll(async () => {
    await e2e.close()
  })

  it("sample_welcome renderiza o template do produto no layout compartilhado e entrega por e-mail", async () => {
    const email = "ana-produto@example.com"
    const name = "Ana"

    await e2e.app.get(RequestContext).run(buildJobContextStore(), () =>
      e2e.app.get(TransactionManager).run(() =>
        e2e.app.get(OutboxPublisher).publish(
          NotificationRequested.from({
            recipientId: ulid(),
            type: "sample_welcome",
            locale: "pt-BR",
            data: { email, name },
          })
        )
      )
    )

    const delivery = await drainOutbox(e2e.app, {
      dispatchers: DELIVERY_DISPATCHERS(e2e.app),
      timeoutMs: 8_000,
      intervalMs: 50,
      until: () => findSent(db.pool, "sample_welcome"),
    })
    expect(delivery).toBeDefined()

    const message = mailer.sent.find((m) => m.to === email)
    expect(message?.to).toBe(email)
    expect(message?.subject).toBe(`Bem-vindo, ${name}`)
    expect(message?.html).toContain(name)
    expect(message?.idempotencyKey).toBe(delivery!.id)
  })
})
