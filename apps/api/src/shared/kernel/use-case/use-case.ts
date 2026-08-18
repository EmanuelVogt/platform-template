/** Contrato de toda operação de negócio: uma entrada, uma saída, assíncrona. */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>
}
