import { Cron } from "@nestjs/schedule"

import {
  maintenanceRegistry,
  type MaintenanceJobName,
} from "./maintenance-registry"
import { getActiveMaintenanceRuntime } from "./maintenance-runtime"

type AsyncJob = (...args: unknown[]) => Promise<void>

/**
 * Marca um método como job de manutenção. Horário e advisory lock vêm do
 * `MaintenanceRegistry` pela `name`, que precisa ter sido registrada antes
 * desta classe ser avaliada. O método roda dentro do envelope do
 * `MaintenanceRuntime` (contexto + tx + lock + isolamento), alcançado por
 * registry estático — mesmo idioma do `@Transactional`. Sem runtime registrado
 * (ex.: unit test sem DI) executa o corpo direto.
 */
export function MaintenanceJob(name: MaintenanceJobName): MethodDecorator {
  const spec = maintenanceRegistry.require(name)
  const cronOptions =
    spec.timeZone === undefined ? { name } : { name, timeZone: spec.timeZone }
  return (target, propertyKey, descriptor: PropertyDescriptor): void => {
    const original = descriptor.value as AsyncJob
    descriptor.value = function (
      this: unknown,
      ...args: unknown[]
    ): Promise<void> {
      const body = (): Promise<void> => original.apply(this, args)
      return getActiveMaintenanceRuntime()?.run(name, body) ?? body()
    }
    Cron(spec.cron, cronOptions)(target, propertyKey, descriptor)
  }
}
