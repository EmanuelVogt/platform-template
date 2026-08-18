import { z } from "zod"

export const attachmentConfigSchema = z.object({
  ATTACHMENT_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5242880),
  ATTACHMENT_ACCESS_LOG_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(180),
  // 500 MB: teto do lote inteiro do relato. Como o arquivo sobe em fluxo pela
  // API, um anexo sozinho pode ocupar o lote todo — por isso os dois valores
  // são iguais.
  ATTACHMENT_FEEDBACK_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(524288000),
  ATTACHMENT_FEEDBACK_MAX_TOTAL_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(524288000),
  // 25 MB: folgado para um lote grande de páginas de grade.
  ATTACHMENT_REPORT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(26214400),
})

export type AttachmentConfig = z.infer<typeof attachmentConfigSchema>
export const ATTACHMENT_CONFIG: unique symbol = Symbol("ATTACHMENT_CONFIG")

export function parseAttachmentConfig(source: NodeJS.ProcessEnv): AttachmentConfig {
  const parsed = attachmentConfigSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Configuração do módulo attachment inválida:\n${parsed.error.message}`,
    )
  }
  return parsed.data
}

export function loadAttachmentConfig(): AttachmentConfig {
  return parseAttachmentConfig(process.env)
}
