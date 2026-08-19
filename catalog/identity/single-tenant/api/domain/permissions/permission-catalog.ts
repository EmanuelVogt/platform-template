import { definePermissionCatalog } from "../../../../shared/kernel/access/define-permission-catalog"
import { PRODUCT_PERMISSION_CATALOGS } from "../../../../shared/kernel/access/product-permission-catalogs"

import { ADMIN_CATALOG } from "./catalog/admin.catalog"

import type { PermissionKey } from "../../../../shared/kernel/access/permission.types"

export const MODULES = [ADMIN_CATALOG, ...PRODUCT_PERMISSION_CATALOGS] as const

type CatalogPermissionKey =
  (typeof MODULES)[number]["features"][number]["permissions"][number]["key"]

declare module "../../../../shared/kernel/access/permission.types" {
  interface PermissionKeyRegistry {
    readonly identity: CatalogPermissionKey
  }
}

export type { PermissionKey }

const catalog = definePermissionCatalog(MODULES)

export const {
  PERMISSION_KEYS,
  featureOf,
  isPermissionKey,
  moduleOf,
  requiresOf,
} = catalog

/** Trilha inteira, sem recorte por assunto (ADR 0049, revisão 2026-08-02). */
export const FULL_AUDIT_PERMISSION = "admin.audit.read" satisfies PermissionKey

/** Chaves "Ver logs" — uma por feature dona de tabela auditada (ADR 0049).
 *  `FULL_AUDIT_PERMISSION` casa com o sufixo mas não é dona de tabela: fica de
 *  fora para preservar a bijeção com `AUDIT_TABLE_OWNERS`. */
export const AUDIT_PERMISSION_KEYS: readonly PermissionKey[] =
  PERMISSION_KEYS.filter(
    (key) => key.endsWith(".audit.read") && key !== FULL_AUDIT_PERMISSION,
  )
