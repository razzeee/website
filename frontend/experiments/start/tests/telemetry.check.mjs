import { test } from "node:test"
import assert from "node:assert/strict"
import * as Sentry from "@sentry/tanstackstart-react"

test("server SDK delivers an error envelope to the local collector", async () => {
  assert.ok(
    process.env.SENTRY_DSN?.startsWith("http://public@127.0.0.1:4101/"),
    "Use the local sandbox DSN",
  )
  Sentry.captureException(new Error("Sandbox server telemetry check"))
  assert.equal(await Sentry.flush(5000), true)
  const events = await (
    await fetch("http://127.0.0.1:4101/__sandbox/events")
  ).json()
  assert.ok(
    events.some((event) =>
      event.envelope?.includes("Sandbox server telemetry check"),
    ),
  )
  await Sentry.close()
})
