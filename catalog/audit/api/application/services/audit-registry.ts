import { Injectable } from "@nestjs/common"

import {
  BASE_AUDITED_TABLES,
  BASE_REF_TARGETS,
} from "../../domain/base-audit-registrations"
import { DuplicateAuditRegistrationError } from "../../domain/errors"

import type { PermissionKey } from "../../../../shared/kernel/access/access-policy.port"
import type {
  AuditedTableRegistration,
  RefTargetRegistration,
} from "../../domain/audit-registration.types"

export type { AuditedTableRegistration, RefTargetRegistration }

/**
 * Registro em runtime de tudo que a auditoria precisa saber para tratar uma
 * tabela: dono, agregado e alvo de FK. Seedado com o base set no construtor;
 * um módulo de produto acrescenta suas próprias tabelas chamando
 * `registerTables`/`registerRefTargets` no `OnModuleInit`.
 */
@Injectable()
export class AuditRegistry {
  private readonly tables = new Map<string, AuditedTableRegistration>()
  private readonly refTargets = new Map<string, RefTargetRegistration>()

  constructor() {
    this.registerTables(BASE_AUDITED_TABLES)
    this.registerRefTargets(BASE_REF_TARGETS)
  }

  registerTables(entries: readonly AuditedTableRegistration[]): void {
    for (const entry of entries) {
      if (this.tables.has(entry.table)) {
        throw new DuplicateAuditRegistrationError(entry.table)
      }
      this.tables.set(entry.table, entry)
    }
  }

  registerRefTargets(entries: readonly RefTargetRegistration[]): void {
    for (const entry of entries) {
      if (this.refTargets.has(entry.column)) {
        throw new DuplicateAuditRegistrationError(entry.column)
      }
      this.refTargets.set(entry.column, entry)
    }
  }

  ownerOf(table: string): PermissionKey | undefined {
    return this.tables.get(table)?.owner
  }

  allowedTables(owned: ReadonlySet<string>): string[] {
    return [...this.tables.values()]
      .filter((entry) => owned.has(entry.owner))
      .map((entry) => entry.table)
  }

  tablesForAggregate(root: string): string[] {
    const satellites = [...this.tables.values()]
      .filter((entry) => entry.aggregateRoot === root)
      .map((entry) => entry.table)
    return [root, ...satellites]
  }

  technicalTables(): string[] {
    return [...this.tables.values()]
      .filter((entry) => entry.technical === true)
      .map((entry) => entry.table)
  }

  refTargetFor(column: string): RefTargetRegistration | undefined {
    return this.refTargets.get(column)
  }

  auditedTables(): readonly string[] {
    return [...this.tables.keys()]
  }
}
