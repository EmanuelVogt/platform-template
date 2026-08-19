import { TagDirectoryFacade } from "../api/facades/tag-directory.facade"
import { TagUsageRegistry } from "../application/tag-usage.registry"

describe("tag — central de tags (contrato para consumidores)", () => {
  it("expõe TagDirectoryFacade.findLiveTagIds(ids) e describeTags(ids)", () => {
    expect(typeof TagDirectoryFacade.prototype.findLiveTagIds).toBe("function")
    expect(TagDirectoryFacade.prototype.findLiveTagIds).toHaveLength(1)
    expect(typeof TagDirectoryFacade.prototype.describeTags).toBe("function")
    expect(TagDirectoryFacade.prototype.describeTags).toHaveLength(1)
  })

  it("expõe TagUsageRegistry.register(reader) e totalsFor — vazio quando ninguém registrou", async () => {
    const registry = new TagUsageRegistry()
    expect(typeof registry.register).toBe("function")
    await expect(registry.totalsFor(["tag-1"])).resolves.toEqual(new Map())
  })
})
