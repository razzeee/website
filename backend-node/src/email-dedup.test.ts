import assert from "node:assert/strict"
import test from "node:test"
import { checkDuplicate, markAsSent } from "./email-dedup"

test("only suppresses a successfully sent message for the same recipient", () => {
  const messageId = `dedup-${Date.now()}-same`

  assert.equal(checkDuplicate(messageId, "first@example.com"), false)

  markAsSent(messageId, "first@example.com")

  assert.equal(checkDuplicate(messageId, "first@example.com"), true)
  assert.equal(checkDuplicate(messageId, "second@example.com"), false)
})

test("does not suppress entries after the one-hour retention period", () => {
  const messageId = `dedup-${Date.now()}-expiry`
  const originalNow = Date.now
  let now = 1_000_000

  Date.now = () => now
  try {
    markAsSent(messageId, "recipient@example.com")
    assert.equal(checkDuplicate(messageId, "recipient@example.com"), true)

    now += 60 * 60 * 1000

    assert.equal(checkDuplicate(messageId, "recipient@example.com"), false)
  } finally {
    Date.now = originalNow
  }
})
