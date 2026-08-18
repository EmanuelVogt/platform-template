export type PreferenceChannelKind = "system" | "email" | "push"

/**
 * Seam de preferências user × type × channel. v1 = tudo ligado; a matriz real
 * é feature deferida (spec, decisão 9). Categoria mandatória ignora isto.
 */
export interface NotificationPreferencesPort {
  allowedChannels(
    recipientId: string,
    type: string
  ): Promise<PreferenceChannelKind[]>
}

export const NOTIFICATION_PREFERENCES = Symbol("NOTIFICATION_PREFERENCES")
