import { ulid } from "ulid"

import { isUnchanged } from "../../../../shared/kernel/domain/entity-props"

export interface TagProps {
  readonly id: string
  readonly name: string
  readonly color: string | null
  readonly isActive: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly deletedAt: Date | null
}

export interface CreateTagInput {
  name: string
  color?: string | null
  isActive?: boolean
}

export interface UpdateTagInput {
  name: string
  color: string | null
  isActive: boolean
}

export class Tag {
  readonly props: TagProps

  private constructor(props: TagProps) {
    this.props = Object.freeze(props)
  }

  static fromProps(props: TagProps): Tag {
    return new Tag(props)
  }

  static create(input: CreateTagInput): Tag {
    const now = new Date()
    return new Tag({
      id: ulid(),
      name: input.name.trim(),
      color: input.color ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
  }

  update(input: UpdateTagInput, now: Date): Tag {
    const next = new Tag({
      ...this.props,
      name: input.name.trim(),
      color: input.color,
      isActive: input.isActive,
      updatedAt: now,
    })
    return isUnchanged(this.props, next.props) ? this : next
  }

  stash(now: Date): Tag {
    return new Tag({ ...this.props, deletedAt: now, updatedAt: now })
  }

  restore(now: Date): Tag {
    return new Tag({ ...this.props, deletedAt: null, updatedAt: now })
  }

  isDeleted(): boolean {
    return this.props.deletedAt !== null
  }
}
