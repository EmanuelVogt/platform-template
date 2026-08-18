import { Global, Module } from "@nestjs/common"

import { AuditTrailRepository } from "./audit-trail.repository"
import { PurgeAuditJob } from "./purge-audit.job"

/**
 * Infra de escrita da trilha de auditoria: purge de retention (`PurgeAuditJob`)
 * e purge LGPD do titular (`AuditTrailRepository`, consumido pelos use cases de
 * purge de user/guest). @Global porque a trilha é kernel e não pode depender de
 * módulo de domínio — senão o ciclo com o módulo de leitura (que injeta o
 * identity para resolver nomes) fecharia. Ver ADR 0041.
 */
@Global()
@Module({
  providers: [AuditTrailRepository, PurgeAuditJob],
  exports: [AuditTrailRepository],
})
export class AuditTrailModule {}
