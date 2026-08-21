export type ValidateEmailChangeInput = {
  token: string
}

export type ValidateEmailChangeOutput = {
  /** Novo e-mail aguardando confirmação — exibido na tela de confirmação. */
  newEmail: string
}
