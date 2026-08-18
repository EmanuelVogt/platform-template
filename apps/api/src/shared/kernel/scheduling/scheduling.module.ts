import { Global, Module } from "@nestjs/common"

import { MaintenanceRuntime } from "./maintenance-runtime"

/**
 * Provê o `MaintenanceRuntime` — envelope de robustez dos jobs de manutenção
 * (advisory lock, contexto, isolamento de falha). Os jobs moram nos módulos de
 * origem decorados com `@MaintenanceJob`; o runtime é alcançado por registry
 * estático, então basta o provider existir no grafo.
 */
@Global()
@Module({
  providers: [MaintenanceRuntime],
  exports: [MaintenanceRuntime],
})
export class SchedulingModule {}
