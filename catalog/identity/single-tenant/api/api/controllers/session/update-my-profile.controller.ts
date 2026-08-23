import { Body, Controller, HttpCode, HttpStatus, Patch } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { UpdateMyProfileUseCase } from "../../../application/use-cases/update-my-profile/update-my-profile.use-case"
import { UpdateMyProfileDto } from "../../contracts/identity.contract"

@ApiTags("Session")
@Controller("auth")
export class UpdateMyProfileController {
  constructor(private readonly updateProfile: UpdateMyProfileUseCase) {}

  @ApiOperation({ operationId: "updateMyProfile" })
  @SelfService()
  @Patch("profile")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Body() dto: UpdateMyProfileDto): Promise<void> {
    await this.updateProfile.execute({ name: dto.name, birthDate: dto.birthDate })
  }
}
