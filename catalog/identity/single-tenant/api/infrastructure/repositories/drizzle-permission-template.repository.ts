import { Injectable } from "@nestjs/common"
import { asc, eq, inArray } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { PermissionTemplate } from "../../domain/entities/permission-template.entity"
import {
  permissionTemplatePermissions,
  permissionTemplates,
} from "../tables/permission-template.table"

import type { PermissionKey } from "../../domain/permissions/permission-catalog"
import type { PermissionTemplateRepository } from "../../domain/ports/permission-template.repository"
import type { PermissionTemplateRow } from "../tables/permission-template.table"

@Injectable()
export class DrizzlePermissionTemplateRepository
  implements PermissionTemplateRepository
{
  constructor(private readonly tx: TransactionManager) {}

  private get db() {
    return this.tx.getExecutor()
  }

  async findById(id: string): Promise<PermissionTemplate | null> {
    const rows = await this.db
      .select()
      .from(permissionTemplates)
      .where(eq(permissionTemplates.id, id))
    const [row] = rows
    if (!row) return null
    return this.toEntity(row, await this.permissionsOf([id]))
  }

  async findByName(name: string): Promise<PermissionTemplate | null> {
    const rows = await this.db
      .select()
      .from(permissionTemplates)
      .where(eq(permissionTemplates.name, name))
    const [row] = rows
    if (!row) return null
    return this.toEntity(row, await this.permissionsOf([row.id]))
  }

  async listAll(): Promise<PermissionTemplate[]> {
    const rows = await this.db
      .select()
      .from(permissionTemplates)
      .orderBy(asc(permissionTemplates.name))
    if (rows.length === 0) return []
    const byTemplate = await this.permissionsOf(rows.map((r) => r.id))
    return rows.map((row) => this.toEntity(row, byTemplate))
  }

  async insert(template: PermissionTemplate): Promise<void> {
    const { props } = template
    await this.db.insert(permissionTemplates).values({
      id: props.id,
      name: props.name,
      description: props.description,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    })
    await this.insertPermissions(props.id, props.permissions)
  }

  async update(template: PermissionTemplate): Promise<void> {
    const { props } = template
    await this.db
      .update(permissionTemplates)
      .set({
        name: props.name,
        description: props.description,
        updatedAt: props.updatedAt,
      })
      .where(eq(permissionTemplates.id, props.id))
    await this.db
      .delete(permissionTemplatePermissions)
      .where(eq(permissionTemplatePermissions.templateId, props.id))
    await this.insertPermissions(props.id, props.permissions)
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(permissionTemplates).where(eq(permissionTemplates.id, id))
  }

  private async insertPermissions(
    templateId: string,
    permissions: readonly PermissionKey[]
  ): Promise<void> {
    if (permissions.length === 0) return
    await this.db
      .insert(permissionTemplatePermissions)
      .values(permissions.map((permission) => ({ templateId, permission })))
  }

  private async permissionsOf(
    ids: string[]
  ): Promise<Map<string, PermissionKey[]>> {
    const rows = await this.db
      .select()
      .from(permissionTemplatePermissions)
      .where(inArray(permissionTemplatePermissions.templateId, ids))
    const map = new Map<string, PermissionKey[]>()
    for (const row of rows) {
      const list = map.get(row.templateId) ?? []
      list.push(row.permission as PermissionKey)
      map.set(row.templateId, list)
    }
    return map
  }

  private toEntity(
    row: PermissionTemplateRow,
    byTemplate: Map<string, PermissionKey[]>
  ): PermissionTemplate {
    return PermissionTemplate.fromProps({
      id: row.id,
      name: row.name,
      description: row.description,
      permissions: byTemplate.get(row.id) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
}
