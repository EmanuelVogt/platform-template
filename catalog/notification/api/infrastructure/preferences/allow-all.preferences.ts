import { Injectable } from "@nestjs/common"

import type {
  NotificationPreferencesPort,
  PreferenceChannelKind,
} from "../../domain/ports/preferences.port"

@Injectable()
export class AllowAllPreferences implements NotificationPreferencesPort {
  async allowedChannels(): Promise<PreferenceChannelKind[]> {
    return ["system", "email", "push"]
  }
}
