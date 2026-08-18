import { Global, Module } from "@nestjs/common"

import { OBJECT_STORAGE } from "./object-storage.port"
import { R2StorageAdapter } from "./r2-storage.adapter"
import { loadStorageConfig } from "./storage.config"

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useFactory: () => new R2StorageAdapter(loadStorageConfig()),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
