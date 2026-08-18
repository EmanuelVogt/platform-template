import {
  getActiveTransactionManager,
  type TxOptions,
} from "./transaction-manager"

type AsyncMethod = (...args: unknown[]) => Promise<unknown>

/**
 * Abre (ou faz join em) uma transação no `TransactionManager` ao redor do
 * método. Fora de ambiente de teste, manager ausente é erro fail-loud (nunca
 * executar em autocommit silencioso); em `NODE_ENV=test` cai no pass-through
 * deliberado do unit test (sem DI, sem manager registrado).
 */
export function Transactional(opts: TxOptions = {}): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor): void => {
    const original = descriptor.value as AsyncMethod
    descriptor.value = function (
      this: unknown,
      ...args: unknown[]
    ): Promise<unknown> {
      const invoke = (): Promise<unknown> => original.apply(this, args)
      const manager = getActiveTransactionManager()
      if (!manager) {
        if (process.env.NODE_ENV === "test") return invoke()
        throw new Error(
          `@Transactional sem TransactionManager registrado (onModuleInit não rodou antes de ${String(propertyKey)})`
        )
      }
      return manager.run(invoke, opts)
    }
  }
}

/** Açúcar para transação somente-leitura (`SET TRANSACTION READ ONLY`). */
export function ReadOnly(opts: Omit<TxOptions, "readOnly"> = {}): MethodDecorator {
  return Transactional({ ...opts, readOnly: true })
}
