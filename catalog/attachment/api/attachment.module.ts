import { Global, Module } from "@nestjs/common"

import { PROFILE_IMAGE_STORE } from "../../shared/kernel/profile-image/profile-image-store.port"

import { AttachmentProfileImageStore } from "./api/adapters/profile-image-store.adapter"
import { CONTROLLERS } from "./api/controllers"
import { AttachmentFacade } from "./api/facades/attachment.facade"
import { PurgeAttachmentAccessLogsJob } from "./application/jobs/purge-attachment-access-logs.job"
import { PurgePendingAttachmentsJob } from "./application/jobs/purge-pending-attachments.job"
import { ConfirmUploadsUseCase } from "./application/use-cases/confirm-uploads/confirm-uploads.use-case"
import { DeleteAttachmentUseCase } from "./application/use-cases/delete-attachment/delete-attachment.use-case"
import { GetAttachmentForDownloadUseCase } from "./application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case"
import { ListAttachmentAccessLogUseCase } from "./application/use-cases/list-attachment-access-log/list-attachment-access-log.use-case"
import { UploadAttachmentUseCase } from "./application/use-cases/upload-attachment/upload-attachment.use-case"
import { UploadAttachmentsBatchUseCase } from "./application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case"
import { ATTACHMENT_CONFIG, loadAttachmentConfig } from "./attachment.config"
import { ATTACHMENT_ACCESS_LOG_REPOSITORY } from "./domain/ports/attachment-access-log.repository"
import { ATTACHMENT_REPOSITORY } from "./domain/ports/attachment.repository"
import { buildUploadProfiles, UPLOAD_PROFILES } from "./domain/upload-profiles"
import { DrizzleAttachmentAccessLogRepository } from "./infrastructure/repositories/drizzle-attachment-access-log.repository"
import { DrizzleAttachmentRepository } from "./infrastructure/repositories/drizzle-attachment.repository"

import type { AttachmentConfig } from "./attachment.config"
import type { Provider } from "@nestjs/common"

const PORTS: Provider[] = [
  { provide: ATTACHMENT_REPOSITORY, useClass: DrizzleAttachmentRepository },
  {
    provide: ATTACHMENT_ACCESS_LOG_REPOSITORY,
    useClass: DrizzleAttachmentAccessLogRepository,
  },
]

const USE_CASES = [
  UploadAttachmentUseCase,
  UploadAttachmentsBatchUseCase,
  GetAttachmentForDownloadUseCase,
  DeleteAttachmentUseCase,
  ConfirmUploadsUseCase,
  ListAttachmentAccessLogUseCase,
]

// O histórico precisa do UserDirectoryFacade, que chega pelo IdentityModule
// global montado na raiz — importar a classe aqui criaria uma segunda instância.
// Global porque a identidade não importa mais o attachment: o binding de
// PROFILE_IMAGE_STORE precisa alcançar o injector do IdentityModule sem aresta
// de import, que recriaria o ciclo entre as duas entradas.
@Global()
@Module({
  controllers: [...CONTROLLERS],
  providers: [
    { provide: ATTACHMENT_CONFIG, useFactory: loadAttachmentConfig },
    {
      provide: UPLOAD_PROFILES,
      useFactory: (config: AttachmentConfig) => buildUploadProfiles(config),
      inject: [ATTACHMENT_CONFIG],
    },
    ...PORTS,
    ...USE_CASES,
    PurgeAttachmentAccessLogsJob,
    PurgePendingAttachmentsJob,
    AttachmentFacade,
    { provide: PROFILE_IMAGE_STORE, useClass: AttachmentProfileImageStore },
  ],
  exports: [AttachmentFacade, PROFILE_IMAGE_STORE],
})
export class AttachmentModule {}
