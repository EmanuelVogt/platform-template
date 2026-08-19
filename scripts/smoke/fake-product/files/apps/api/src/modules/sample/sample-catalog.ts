import type { ModuleDef } from "../../shared/kernel/access/permission.types"

/** Catálogo de permissões do produto de exemplo (smoke do template): entra no
 *  slot `PRODUCT_PERMISSION_CATALOGS` sem editar nenhum arquivo da plataforma. */
export const SAMPLE_CATALOG = {
  key: "sample",
  label: "Amostra",
  features: [
    {
      key: "things",
      label: "Coisas",
      permissions: [
        {
          key: "sample.things.audit.read",
          label: "Ver logs de coisas",
          requires: [],
        },
      ],
    },
  ],
} as const satisfies ModuleDef

type SampleCatalogPermissionKey =
  (typeof SAMPLE_CATALOG)["features"][number]["permissions"][number]["key"]

declare module "../../shared/kernel/access/permission.types" {
  interface PermissionKeyRegistry {
    readonly sample: SampleCatalogPermissionKey
  }
}
