/**
 * Bytes em MB para mensagem user-facing: quem lê a tela não sabe o que
 * significa um número cru de bytes.
 */
export function formatMegabytes(bytes: number): string {
  return `${String(Math.round(bytes / (1024 * 1024)))} MB`
}
