import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

test("invalidation CLI refuses missing deployment configuration before connecting", () => {
  for (const changes of [
    { REDIS_URL: "", GITHUB_SHA: "test-release" },
    { REDIS_URL: "redis://127.0.0.1:1", GITHUB_SHA: "" },
    { REDIS_URL: "redis://127.0.0.1:1", GITHUB_SHA: "  " },
  ]) {
    const result = spawnSync(
      process.execPath,
      [new URL("../invalidate.mjs", import.meta.url).pathname, "/en/about"],
      { env: { ...process.env, ...changes }, encoding: "utf8" },
    )
    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /Provide REDIS_URL and the deployment's GITHUB_SHA/,
    )
    assert.doesNotMatch(result.stdout, /Origin invalidated/)
    assert.doesNotMatch(result.stderr, /ECONNREFUSED/)
  }
})
