import { Module } from "@nestjs/common"

import { IdentityModule } from "../identity/identity.module"

import { AuditController } from "./api/controllers/audit.controller"
import { UsageActivityFacade } from "./api/facades/usage-activity.facade"
import { ListAuditEntriesUseCase } from "./application/list-audit-entries/list-audit-entries.use-case"
import { ACTIVITY_STATS_READER } from "./domain/ports/activity-stats.reader"
import { AUDIT_REPOSITORY } from "./domain/ports/audit.repository"
import { REF_LABEL_READER } from "./domain/ports/ref-label.reader"
import { DrizzleActivityStatsReader } from "./infrastructure/repositories/drizzle-activity-stats.reader"
import { DrizzleAuditRepository } from "./infrastructure/repositories/drizzle-audit.repository"
import { DrizzleRefLabelReader } from "./infrastructure/repositories/drizzle-ref-label.reader"

/**
 * Módulo de leitura da trilha de auditoria. A captura é do trigger (migration
 * 0054) e a manutenção/purge do kernel (AuditTrailModule) — aqui só GET /v1/audit.
 * Importa IdentityModule para resolver o nome do ator (UserDirectoryFacade);
 * não é importado de volta pelo identity, então não há ciclo. Ver ADR 0041.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AuditController],
  providers: [
    { provide: AUDIT_REPOSITORY, useClass: DrizzleAuditRepository },
    { provide: REF_LABEL_READER, useClass: DrizzleRefLabelReader },
    { provide: ACTIVITY_STATS_READER, useClass: DrizzleActivityStatsReader },
    ListAuditEntriesUseCase,
    UsageActivityFacade,
  ],
  exports: [UsageActivityFacade],
})
export class AuditModule {}
