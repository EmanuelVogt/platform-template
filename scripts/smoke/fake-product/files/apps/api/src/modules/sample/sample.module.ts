import { join } from "node:path"

import { Injectable, Module } from "@nestjs/common"
import { z } from "zod"

import { AuditRegistry } from "../audit/api/facades/audit-registry.facade"
import { AuditModule } from "../audit/audit.module"
import {
  defineCatalogEntry,
  NotificationTemplateSourceRegistry,
} from "../notification/api/facades/notification-templates.facade"
import { NotificationModule } from "../notification/notification.module"

import type { OnModuleInit } from "@nestjs/common"

declare module "../notification/api/events/notification-requested.event" {
  interface NotificationTypeRegistry {
    sample: "sample_welcome"
  }
}

@Injectable()
class SampleModuleInit implements OnModuleInit {
  constructor(
    private readonly templates: NotificationTemplateSourceRegistry,
    private readonly audit: AuditRegistry,
  ) {}

  onModuleInit(): void {
    this.templates.register({
      type: "sample_welcome",
      catalog: defineCatalogEntry({
        category: "transactional",
        channels: ["email"],
        dataSchema: z.object({ email: z.email(), name: z.string().min(1) }),
      }),
      email: {
        template: "sample-welcome",
        templateDir: join(__dirname, "templates"),
        subject: (data) => `Bem-vindo, ${String(data.name)}`,
      },
    })

    this.audit.registerTables([
      { schema: "sample", table: "things", owner: "sample.things.audit.read" },
    ])
    this.audit.registerRefTargets([
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
  imports: [AuditModule, NotificationModule],
  providers: [SampleModuleInit],
})
export class SampleModule {}
