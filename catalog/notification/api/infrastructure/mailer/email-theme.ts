/**
 * Valores literais próprios deste módulo — não há stylesheet de design system
 * no template para sincronizar. E-mail não lê CSS var, então isolar aqui é
 * proposital: ajustar manualmente se o produto trouxer sua própria paleta.
 */
export const emailTheme = {
  primary: "#719149",
  primaryForeground: "#ffffff",
  foreground: "#2a3320",
  background: "#fbfbf7",
  muted: "#7e8273",
  border: "#e6e7dd",
  radiusMd: "10px",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const

export type EmailTheme = typeof emailTheme
