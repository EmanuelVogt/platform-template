import {
  Global,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common"

import { stopTracing } from "./tracing.setup"

@Injectable()
class TracingLifecycle implements OnApplicationShutdown {
  // Flush dos spans bufferizados no shutdown. beforeExit não dispara em
  // SIGTERM/SIGINT; o enableShutdownHooks do Nest roda este hook antes de sair.
  async onApplicationShutdown(): Promise<void> {
    await stopTracing()
  }
}

@Global()
@Module({
  providers: [TracingLifecycle],
})
export class TracingModule {}
