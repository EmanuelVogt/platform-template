import type { PermissionTemplateView } from "../../../api/contracts/permission-template.contract"

export type GetPermissionTemplateInput = { id: string }
export type GetPermissionTemplateOutput = { template: PermissionTemplateView }
