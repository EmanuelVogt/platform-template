/**
 * Valores literais derivados de packages/ui/src/styles/globals.css. E-mail não
 * lê CSS var — sincronizar manualmente ao mudar os tokens do design system.
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
