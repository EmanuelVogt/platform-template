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

/**
 * Declara que o método roda deliberadamente FORA de transação. Existe para o
 * caso em que o corpo embrulha IO externo (stream de storage, upload de
 * imagem): abrir transação — mesmo `@ReadOnly()` — prenderia uma conexão do
 * pool pela duração do IO. Não embrulha nada; é a declaração que o guard de
 * cobertura transacional lê. O motivo é obrigatório, senão a isenção vira
 * escape hatch silencioso.
 */
export function NonTransactional(reason: string): MethodDecorator {
  if (reason.trim().length === 0) {
    throw new Error("@NonTransactional exige um motivo não vazio")
  }
  return (): void => undefined
}
