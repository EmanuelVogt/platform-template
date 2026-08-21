import { Module } from "@nestjs/common"

import { IdentityModule } from "../identity/identity.module"

import { AuditController } from "./api/controllers/audit.controller"
import { UsageActivityFacade } from "./api/facades/usage-activity.facade"
import { ListAuditEntriesUseCase } from "./application/list-audit-entries/list-audit-entries.use-case"
import { ActivityAreaResolver } from "./application/services/activity-area-resolver"
import { AuditRegistry } from "./application/services/audit-registry"
import { ACTIVITY_STATS_READER } from "./domain/ports/activity-stats.reader"
import { AUDIT_REPOSITORY } from "./domain/ports/audit.repository"
import { REF_LABEL_READER } from "./domain/ports/ref-label.reader"
import { DrizzleActivityStatsReader } from "./infrastructure/repositories/drizzle-activity-stats.reader"
import { DrizzleAuditRepository } from "./infrastructure/repositories/drizzle-audit.repository"
import { DrizzleRefLabelReader } from "./infrastructure/repositories/drizzle-ref-label.reader"
import { AuditTrailModule } from "./infrastructure/trail/audit-trail.module"

/**
 * Módulo da trilha de auditoria: leitura (GET /v1/audit) e manutenção/purge
 * (AuditTrailModule, importado de infrastructure/trail — captura é do trigger,
 * migration 0054). Importa IdentityModule para resolver o nome do ator
 * (UserDirectoryFacade); não é importado de volta pelo identity, então não há
 * ciclo. Ver ADR 0041.
 */
@Module({
  imports: [IdentityModule, AuditTrailModule],
  controllers: [AuditController],
  providers: [
    { provide: AUDIT_REPOSITORY, useClass: DrizzleAuditRepository },
    { provide: REF_LABEL_READER, useClass: DrizzleRefLabelReader },
    { provide: ACTIVITY_STATS_READER, useClass: DrizzleActivityStatsReader },
    ListAuditEntriesUseCase,
    UsageActivityFacade,
    AuditRegistry,
    ActivityAreaResolver,
  ],
  exports: [UsageActivityFacade, AuditRegistry],
})
export class AuditModule {}
