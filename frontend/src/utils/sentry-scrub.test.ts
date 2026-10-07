import { describe, expect, it } from "vitest"
import { scrubSentryPayload } from "./sentry-scrub"

describe("scrubSentryPayload", () => {
  it("redacts credential fields and query parameters while retaining safe context", () => {
    const payload = {
      request: {
        url: "https://example.test/callback?access_token=access-secret&code=oauth-code&state=csrf-secret&next=%2Fhome#refresh_token=refresh-secret",
        headers: {
          Authorization: "Bearer bearer-secret",
          Cookie: "session=cookie-secret",
          Accept: "application/json",
        },
        data: { client_secret: "client-secret", intent: "publish" },
      },
      extra: { refresh_token: "refresh-secret" },
      exception: { values: [{ value: "failed with Bearer bearer-secret" }] },
      breadcrumb: {
        data: { url: "https://example.test/?api_key=api-secret&safe=yes" },
      },
    }

    const scrubbed = scrubSentryPayload(payload)
    const serialized = JSON.stringify(scrubbed)

    for (const secret of [
      "access-secret",
      "refresh-secret",
      "bearer-secret",
      "cookie-secret",
      "client-secret",
      "api-secret",
      "oauth-code",
      "csrf-secret",
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).toContain("next=%2Fhome")
    expect(serialized).toContain("intent")
    expect(serialized).toContain("publish")
    expect(serialized).toContain("safe=yes")
  })
})
