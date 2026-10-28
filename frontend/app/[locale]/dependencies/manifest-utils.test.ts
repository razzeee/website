import { describe, expect, it } from "vitest"
import { declarationAtPointer, safeSourceUrl } from "./manifest-utils"

describe("manifest declaration links", () => {
  it("distinguishes duplicate names using numeric pointers", () => {
    const manifest = {
      modules: [
        { name: "same" },
        { name: "same", sources: [{ type: "patch", path: "fix.patch" }] },
      ],
    }
    expect(declarationAtPointer(manifest, "/modules/1/sources/0")).toEqual({
      type: "patch",
      path: "fix.patch",
    })
    expect(
      declarationAtPointer(manifest, "/modules/0/sources/0"),
    ).toBeUndefined()
    expect(declarationAtPointer(manifest, "/modules/__proto__")).toBeUndefined()
    expect(declarationAtPointer(manifest, "/modules/9")).toBeUndefined()
  })
  it("renders only HTTP source URLs as clickable links", () => {
    expect(safeSourceUrl("https://example.org/library.tar.gz")).toBe(true)
    expect(safeSourceUrl("javascript:alert(1)")).toBe(false)
    expect(safeSourceUrl("file:///etc/passwd")).toBe(false)
    expect(safeSourceUrl("git@example.org:repo")).toBe(false)
  })
})
