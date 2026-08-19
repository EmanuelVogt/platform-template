import { Global, Module } from "@nestjs/common"

import { AuditTrailRepository } from "./audit-trail.repository"
import { PurgeAuditJob } from "./purge-audit.job"

/**
 * Infra de escrita da trilha de auditoria: purge de retention (`PurgeAuditJob`)
 * e purge LGPD do titular (`AuditTrailRepository`, consumido pelos use cases de
 * purge de user/guest). @Global porque a escrita da trilha precisa ficar
 * disponível para qualquer módulo que faça purge de titular, sem criar um
 * import cruzado explícito com este módulo. Ver ADR 0041.
 */
@Global()
@Module({
  providers: [AuditTrailRepository, PurgeAuditJob],
  exports: [AuditTrailRepository],
})
export class AuditTrailModule {}
