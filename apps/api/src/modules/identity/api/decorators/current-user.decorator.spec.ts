import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants"

import { CurrentUser } from "./current-user.decorator"

describe("@CurrentUser", () => {
  it("registra um param decorator no handler", () => {
    class Controller {
      handler(@CurrentUser() _userId: string): void {
        return
      }
    }
    const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Controller, "handler")
    expect(meta).toBeDefined()
    expect(Object.keys(meta).length).toBe(1)
  })
})
