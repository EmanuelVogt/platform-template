import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import "@testing-library/jest-dom/vitest"
import "@/app/config/zod-locale"

afterEach(() => {
  cleanup()
})
