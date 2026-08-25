import { Global, Module } from "@nestjs/common"

import { NullStorageAdapter } from "./null-storage.adapter"
import { OBJECT_STORAGE } from "./object-storage.port"
import { S3StorageAdapter } from "./s3-storage.adapter"
import { loadStorageConfig } from "./storage.config"

import type { ObjectStoragePort } from "./object-storage.port"

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useFactory: (): ObjectStoragePort => {
        const config = loadStorageConfig()
        return config ? new S3StorageAdapter(config) : new NullStorageAdapter()
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
