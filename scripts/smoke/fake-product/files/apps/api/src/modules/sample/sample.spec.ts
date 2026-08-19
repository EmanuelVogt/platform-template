import { ACCESS_PROFILES } from "../../shared/kernel/access/permission.types"
import {
  ROUTE_UPLOAD_PROFILE_NAMES,
  UPLOAD_PROFILE_NAMES,
} from "../attachment/domain/upload-profiles"
import { PERMISSION_KEYS } from "../identity/domain/permissions/permission-catalog"

describe("produto de exemplo estende os slots da plataforma (smoke)", () => {
  it("inclui o perfil de acesso do produto", () => {
    expect(ACCESS_PROFILES).toContain("receptionist")
  })

  it("inclui as chaves do catálogo de permissões do produto", () => {
    expect(PERMISSION_KEYS).toContain("sample.things.audit.read")
  })

  it("inclui o nome do perfil de upload do produto", () => {
    expect(UPLOAD_PROFILE_NAMES).toContain("sample-doc")
  })

  it("expõe o perfil de upload do produto na rota genérica", () => {
    expect(ROUTE_UPLOAD_PROFILE_NAMES).toContain("sample-doc")
  })
})
