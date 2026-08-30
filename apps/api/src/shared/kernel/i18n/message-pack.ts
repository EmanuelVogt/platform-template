/**
 * Pacote de mensagens do kernel, selecionado por `DEFAULT_LOCALE`. Cobre só os
 * textos genéricos que o próprio kernel produz (título/detail de RFC 7807 para
 * falha de validação e erro interno) — o `title`/`detail` de um `DomainError`
 * de módulo continua literal no módulo que o lança (`.agents/skills/backend-architecture/SKILL.md:84`).
 */
export type MessagePack = {
  readonly validationTitle: string
  readonly validationDetail: string
  readonly internalTitle: string
}

const ptBR: MessagePack = {
  validationTitle: "Erro de validação",
  validationDetail: "Payload inválido",
  internalTitle: "Erro interno",
}

const packs: Record<string, MessagePack> = {
  "pt-BR": ptBR,
}

/** Pacote padrão do kernel — reproduz as strings de hoje sem nenhuma mudança. */
export const DEFAULT_MESSAGE_PACK: MessagePack = ptBR

/** Locale sem pacote dedicado cai no pacote padrão (`pt-BR`). */
export function messagePackFor(locale: string): MessagePack {
  return packs[locale] ?? DEFAULT_MESSAGE_PACK
}
