import { Module } from "@nestjs/common"

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
 * migration 0054). O nome do ator (UserDirectoryFacade) chega pelo
 * IdentityModule global montado na raiz — importar a classe aqui criaria uma
 * segunda instância vazia (mesma armadilha documentada em
 * attachment.module.ts; era a causa de "Nest can't resolve dependencies of
 * the AuthMiddleware... SessionRepository", exposta pela 1ª vez pelo gate de
 * DB tier por entrada, AC3, com identity+audit instalados juntos). Ver ADR 0041.
 */
@Module({
  imports: [AuditTrailModule],
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
