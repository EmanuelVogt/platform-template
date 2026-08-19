import { Inject } from "@nestjs/common"

import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../../../shared/infra/storage/object-storage.port"
import { DomainError } from "../../../../../shared/kernel/errors/domain.error"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { Attachment } from "../../../domain/attachment.entity"
import { CountingLimit } from "../../../domain/counting-limit"
import {
  EmptyUploadBatchError,
  UploadInterruptedError,
  UploadQuotaExceededError,
} from "../../../domain/errors"
import { formatMegabytes } from "../../../domain/format-megabytes"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../../domain/ports/attachment.repository"
import {
  UPLOAD_PROFILES,
  type UploadProfileCatalog,
} from "../../../domain/upload-profiles"

import type {
  UploadAttachmentsBatchInput,
  UploadAttachmentsBatchOutput,
} from "./types"

@UseCase()
export class UploadAttachmentsBatchUseCase {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    @Inject(UPLOAD_PROFILES) private readonly profiles: UploadProfileCatalog,
    private readonly txManager: TransactionManager,
  ) {}

  @Traced({ name: "attachment.uploadBatch" })
  async execute(
    input: UploadAttachmentsBatchInput,
  ): Promise<UploadAttachmentsBatchOutput> {
    const profile = this.profiles[input.profile]
    const uploaded: Attachment[] = []
    const storedKeys: string[] = []
    let batchBytes = 0

    try {
      for await (const file of input.files) {
        if (uploaded.length >= profile.maxFiles) {
          throw new UploadQuotaExceededError(
            `Máximo de ${String(profile.maxFiles)} arquivos por envio.`,
          )
        }

        const pending = Attachment.createPending({
          contentType: file.contentType,
          sizeBytes: 0,
          originalFilename: file.filename,
          profile: input.profile,
          visibility: profile.visibility,
          ownerUserId: input.ownerUserId,
        })

        const allowance = Math.min(profile.maxBytes, profile.maxTotalBytes - batchBytes)
        const counter = new CountingLimit(allowance)
        let sourceFailure: Error | null = null
        // Leitura por função: quem escreve é o callback do stream.
        const takeSourceFailure = (): Error | null => sourceFailure
        // pipe não repassa erro da origem: sem isto, arquivo derrubado no meio
        // (cliente desligou) deixaria o envio ao storage esperando bytes que
        // não vêm mais.
        file.stream.on("error", (error: Error) => {
          sourceFailure = error
          counter.destroy(error)
        })
        file.stream.pipe(counter)

        storedKeys.push(pending.props.storageKey)
        try {
          await this.storage.putStream(
            pending.props.storageKey,
            counter,
            pending.props.contentType,
          )
        } catch (error) {
          // O erro do stream chega embrulhado pelo SDK; a cota é o motivo real
          // sempre que o contador acusa estouro.
          if (counter.exceeded) {
            throw new UploadQuotaExceededError(
              `O total não pode passar de ${formatMegabytes(profile.maxTotalBytes)}.`,
            )
          }
          // Falha vinda do corpo da requisição é problema do envio, não do
          // servidor: o corpo parou de chegar ou veio malformado. Falha do
          // storage segue como está e vira erro de servidor.
          const fromBody = takeSourceFailure()
          if (fromBody !== null) {
            throw fromBody instanceof DomainError ? fromBody : new UploadInterruptedError()
          }
          throw error
        }

        batchBytes += counter.bytes
        uploaded.push(pending.withUploadedSize(counter.bytes))
      }

      if (uploaded.length === 0) {
        throw new EmptyUploadBatchError()
      }

      // Só grava depois que todos os objetos estão no bucket: nada de linha
      // apontando para arquivo que não subiu (D7 do ADR 0021).
      await this.txManager.run(() => this.repo.insertMany(uploaded))
    } catch (error) {
      await this.discard(storedKeys)
      throw error
    }

    return {
      uploads: uploaded.map((attachment) => ({
        attachmentId: attachment.props.id,
      })),
    }
  }

  /**
   * Lote é tudo ou nada: o que já subiu antes da falha não tem linha que o
   * aponte, e o expurgo de pendentes só recolhe objeto com linha. Se apagar
   * falhar, o objeto vira lixo no bucket — mas o motivo original da recusa é o
   * que precisa chegar ao usuário, então a falha aqui não sobe.
   */
  private async discard(storageKeys: string[]): Promise<void> {
    await Promise.allSettled(storageKeys.map((key) => this.storage.delete(key)))
  }
}
