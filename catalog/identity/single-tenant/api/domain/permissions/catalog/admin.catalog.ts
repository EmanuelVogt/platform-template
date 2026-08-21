import type { ModuleDef } from "../../access/permission.types"

export const ADMIN_CATALOG = {
  key: "admin",
  label: "Administração",
  features: [
    {
      key: "users",
      label: "Usuários",
      permissions: [
        { key: "admin.users.read", label: "Ver usuários", requires: [] },
        {
          key: "admin.users.create",
          label: "Criar usuário",
          requires: ["admin.users.read"],
        },
        {
          key: "admin.users.update",
          label: "Editar usuário",
          requires: ["admin.users.read"],
        },
        {
          key: "admin.users.delete",
          label: "Mover para a lixeira",
          requires: ["admin.users.read"],
        },
        {
          key: "admin.users.trash.read",
          label: "Ver lixeira",
          requires: ["admin.users.read"],
        },
        {
          key: "admin.users.trash.restore",
          label: "Restaurar da lixeira",
          requires: ["admin.users.trash.read"],
        },
        {
          key: "admin.users.trash.purge",
          label: "Excluir definitivamente",
          requires: ["admin.users.trash.read"],
        },
        {
          key: "admin.users.access_link.resend",
          label: "Reenviar link de acesso",
          requires: ["admin.users.read"],
        },
        {
          key: "admin.users.audit.read",
          label: "Ver logs",
          requires: ["admin.users.read"],
        },
      ],
    },
    {
      key: "permission_templates",
      label: "Modelos de permissão",
      permissions: [
        {
          key: "admin.permission_templates.read",
          label: "Ver modelos de permissão",
          requires: [],
        },
        {
          key: "admin.permission_templates.create",
          label: "Criar modelo",
          requires: ["admin.permission_templates.read"],
        },
        {
          key: "admin.permission_templates.update",
          label: "Editar modelo",
          requires: ["admin.permission_templates.read"],
        },
        {
          key: "admin.permission_templates.delete",
          label: "Excluir modelo",
          requires: ["admin.permission_templates.read"],
        },
        {
          key: "admin.permission_templates.audit.read",
          label: "Ver logs",
          requires: ["admin.permission_templates.read"],
        },
      ],
    },
    {
      key: "tags",
      label: "Tags",
      permissions: [
        {
          key: "admin.tags.read",
          label: "Ver tags",
          requires: [],
        },
        {
          key: "admin.tags.create",
          label: "Criar tag",
          requires: ["admin.tags.read"],
        },
        {
          key: "admin.tags.update",
          label: "Editar tag",
          requires: ["admin.tags.read"],
        },
        {
          key: "admin.tags.delete",
          label: "Mover tag para a lixeira",
          requires: ["admin.tags.read"],
        },
        {
          key: "admin.tags.trash.read",
          label: "Ver lixeira de tags",
          requires: ["admin.tags.read"],
        },
        {
          key: "admin.tags.trash.restore",
          label: "Restaurar tag",
          requires: ["admin.tags.trash.read"],
        },
        {
          key: "admin.tags.trash.purge",
          label: "Excluir tag definitivamente",
          requires: ["admin.tags.trash.read"],
        },
        {
          key: "admin.tags.audit.read",
          label: "Ver logs",
          requires: ["admin.tags.read"],
        },
      ],
    },
    {
      key: "audit",
      label: "Auditoria",
      permissions: [
        {
          key: "admin.audit.read",
          label: "Ver trilha completa",
          requires: [],
        },
      ],
    },
    {
      key: "usage",
      label: "Uso do sistema",
      permissions: [
        {
          key: "admin.usage.read",
          label: "Ver painel de uso",
          requires: [],
        },
      ],
    },
  ],
} as const satisfies ModuleDef
