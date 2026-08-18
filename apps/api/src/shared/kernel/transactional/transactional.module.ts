import { Global, Module } from "@nestjs/common"

import { TransactionManager } from "./transaction-manager"

@Global()
@Module({
  providers: [TransactionManager],
  exports: [TransactionManager],
})
export class TransactionalModule {}
