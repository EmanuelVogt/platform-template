import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { getActor } from "../context/request-context"
import { ForbiddenError } from "../errors/forbidden.error"

import {
  ACCESS_POLICY,
  type AccessPolicy,
  type AccessRequirement,
} from "./access-policy.port"
import { AccessPolicyMissingError } from "./access.errors"
import { ACCESS_REQUIREMENT } from "./decorators"

const FAIL_CLOSED_DEFAULT: AccessRequirement = { kind: "authenticated" }

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(ACCESS_POLICY)
    private readonly policy: AccessPolicy | null = null
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement =
      this.reflector.getAllAndOverride<AccessRequirement | undefined>(
        ACCESS_REQUIREMENT,
        [context.getHandler(), context.getClass()]
      ) ?? FAIL_CLOSED_DEFAULT

    if (requirement.kind === "public") {
      return true
    }

    if (this.policy === null) {
      throw new AccessPolicyMissingError()
    }

    if (!(await this.policy.can(getActor(), requirement))) {
      throw new ForbiddenError()
    }

    return true
  }
}
