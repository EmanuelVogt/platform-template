import type {
  AuditedTableRegistration,
  RefTargetRegistration,
} from "./audit-registration.types"
import type { PermissionKey } from "../../../shared/kernel/access/permission.types"

const USERS_OWNER: PermissionKey = "admin.users.audit.read"
const PERMISSION_TEMPLATES_OWNER: PermissionKey =
  "admin.permission_templates.audit.read"
const TAGS_OWNER: PermissionKey = "admin.tags.audit.read"

/** Tabelas do base set já auditadas antes deste registry (migration
 *  0003_audit_trail) — dono, agregado e marcação técnica de cada uma. */
export const BASE_AUDITED_TABLES: readonly AuditedTableRegistration[] = [
  { schema: "identity", table: "users", owner: USERS_OWNER },
  {
    schema: "identity",
    table: "user_permissions",
    owner: USERS_OWNER,
    aggregateRoot: "users",
  },
  {
    schema: "identity",
    table: "user_professional_areas",
    owner: USERS_OWNER,
    aggregateRoot: "users",
  },
  {
    schema: "identity",
    table: "user_professional_services",
    owner: USERS_OWNER,
    aggregateRoot: "users",
  },
  {
    schema: "identity",
    table: "user_scheduling_areas",
    owner: USERS_OWNER,
    aggregateRoot: "users",
  },
  {
    schema: "identity",
    table: "user_professional_schedule_configs",
    owner: USERS_OWNER,
    aggregateRoot: "users",
  },
  {
    schema: "identity",
    table: "user_professional_schedule_config_slots",
    owner: USERS_OWNER,
    aggregateRoot: "users",
  },
  {
    schema: "identity",
    table: "user_professional_schedule_config_blocks",
    owner: USERS_OWNER,
    aggregateRoot: "users",
  },
  {
    schema: "identity",
    table: "professional_default_hours",
    owner: USERS_OWNER,
  },
  { schema: "identity", table: "devices", owner: USERS_OWNER, technical: true },
  { schema: "identity", table: "sessions", owner: USERS_OWNER, technical: true },
  {
    schema: "identity",
    table: "verification_tokens",
    owner: USERS_OWNER,
    technical: true,
  },
  {
    schema: "identity",
    table: "permission_templates",
    owner: PERMISSION_TEMPLATES_OWNER,
  },
  {
    schema: "identity",
    table: "permission_template_permissions",
    owner: PERMISSION_TEMPLATES_OWNER,
    aggregateRoot: "permission_templates",
  },
  { schema: "tag", table: "tags", owner: TAGS_OWNER },
]

/** Colunas de FK do base set cujo valor é resolvido para o nome do alvo na
 *  listagem da trilha (ADR 0047). */
export const BASE_REF_TARGETS: readonly RefTargetRegistration[] = [
  {
    column: "user_id",
    schema: "identity",
    table: "users",
    labelColumn: "name",
  },
  {
    column: "professional_user_id",
    schema: "identity",
    table: "users",
    labelColumn: "name",
  },
  {
    column: "template_id",
    schema: "identity",
    table: "permission_templates",
    labelColumn: "name",
  },
]
