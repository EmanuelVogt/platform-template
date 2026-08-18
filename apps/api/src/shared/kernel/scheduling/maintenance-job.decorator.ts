import { Cron } from "@nestjs/schedule"

import { getActiveMaintenanceRuntime } from "./maintenance-runtime"
import {
  MAINTENANCE_SCHEDULE,
  type MaintenanceJobName,
  type MaintenanceJobSpec,
} from "./maintenance-schedule"

type AsyncJob = (...args: unknown[]) => Promise<void>

/**
 * Marca um método como job de manutenção. Horário e advisory lock vêm do
 * registro central `MAINTENANCE_SCHEDULE` pela `name`. O método roda dentro do
 * envelope do `MaintenanceRuntime` (contexto + tx + lock + isolamento),
 * alcançado por registry estático — mesmo idioma do `@Transactional`. Sem
 * runtime registrado (ex.: unit test sem DI) executa o corpo direto.
 */
export function MaintenanceJob(name: MaintenanceJobName): MethodDecorator {
  // `as const satisfies` no registro omite chaves opcionais ausentes; o cast
  // recupera `timeZone?` do contrato MaintenanceJobSpec.
  const spec = MAINTENANCE_SCHEDULE[name] as MaintenanceJobSpec
  const cronOptions =
    spec.timeZone === undefined
      ? { name }
      : { name, timeZone: spec.timeZone }
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
