import { ulid } from "ulid"

import type { PermissionKey } from "../permissions/permission-catalog"

export interface PermissionTemplateProps {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly permissions: readonly PermissionKey[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class PermissionTemplate {
  readonly props: PermissionTemplateProps

  private constructor(props: PermissionTemplateProps) {
    this.props = Object.freeze(props)
  }

  static fromProps(props: PermissionTemplateProps): PermissionTemplate {
    return new PermissionTemplate(props)
  }

  static create(
    input: {
      name: string
      description: string | null
      permissions: readonly PermissionKey[]
    },
    now: Date
  ): PermissionTemplate {
    return new PermissionTemplate({
      id: ulid(),
      name: input.name.trim(),
      description: input.description,
      permissions: [...new Set(input.permissions)],
      createdAt: now,
      updatedAt: now,
    })
  }

  update(
    input: {
      name: string
      description: string | null
      permissions: readonly PermissionKey[]
    },
    now: Date
  ): PermissionTemplate {
    return new PermissionTemplate({
      ...this.props,
      name: input.name.trim(),
      description: input.description,
      permissions: [...new Set(input.permissions)],
      updatedAt: now,
    })
  }
}
