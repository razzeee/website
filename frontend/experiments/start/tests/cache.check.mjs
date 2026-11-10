import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { createPageCache, cacheableRequest } from "../src/cache.server.mjs"

test("shared cache coalesces renders, expires and fences in-flight invalidation", async (t) => {
  assert.ok(process.env.REDIS_URL, "Run with a dedicated REDIS_URL")
  const options = {
    url: process.env.REDIS_URL,
    namespace: randomUUID(),
    freshMs: 300,
    onError: (error) => {
      throw error
    },
  }
  const a = createPageCache(options),
    b = createPageCache(options)
  t.after(async () => {
    await a.close()
    await b.close()
  })
  let renders = 0
  const produce = async () => {
    renders++
    await delay(40)
    return { text: "hello" }
  }
  const results = await Promise.all([
    a.cached("/en", "html", produce),
    b.cached("/en", "html", produce),
  ])
  assert.equal(renders, 1)
  assert.deepEqual(results.map((r) => r.state).sort(), ["HIT", "MISS"])
  assert.deepEqual((await b.cached("/en", "html", produce)).value, {
    text: "hello",
  })
  await delay(320)
  assert.equal((await b.cached("/en", "html", produce)).state, "MISS")
  await a.cached("/en", "data", produce)
  await b.invalidate("/en")
  assert.equal((await a.cached("/en", "html", produce)).state, "MISS")
  assert.equal((await a.cached("/en", "data", produce)).state, "MISS")
  let release, started
  const gate = new Promise((r) => {
    release = r
  })
  const ready = new Promise((r) => {
    started = r
  })
  const old = a.cached("/de", "html", async () => {
    started()
    await gate
    return "old"
  })
  await ready
  await b.invalidate("/de")
  assert.equal((await b.cached("/de", "html", async () => "new")).value, "new")
  release()
  await old
  assert.equal(
    (await a.cached("/de", "html", async () => "wrong")).value,
    "new",
  )
})

test("errors and non-cacheable results are never cached; Redis failure renders once", async (t) => {
  const cache = createPageCache({
    url: process.env.REDIS_URL,
    namespace: randomUUID(),
    onError: () => {},
  })
  t.after(() => cache.close())
  let calls = 0
  await assert.rejects(
    cache.cached("/en", "data", () => {
      calls++
      throw new Error("upstream")
    }),
    /upstream/,
  )
  assert.equal(calls, 1)
  assert.equal((await cache.cached("/en", "data", () => null)).state, "MISS")
  assert.equal((await cache.cached("/en", "data", () => "ok")).state, "MISS")
  const offline = createPageCache({
    url: "redis://127.0.0.1:1",
    namespace: randomUUID(),
    onError: () => {},
  })
  t.after(() => offline.close())
  calls = 0
  assert.deepEqual(
    await offline.cached("/en", "html", () => {
      calls++
      return "available"
    }),
    { value: "available", state: "BYPASS" },
  )
  assert.equal(calls, 1)
})

test("only explicit anonymous public document routes can share HTML", () => {
  assert.equal(
    cacheableRequest(
      new Request("https://example.test/en", {
        headers: { cookie: "NEXT_LOCALE=en" },
      }),
    ),
    true,
  )
  for (const path of [
    "/en",
    "/en/apps/org.mozilla.firefox",
    "/de/apps/category/graphics/1",
  ]) {
    assert.equal(
      cacheableRequest(new Request(`https://example.test${path}`)),
      true,
    )
  }
  for (const path of [
    "/en/login",
    "/en/settings",
    "/en/login/email/confirm?token=x",
    "/en?theme=dark",
    "/_serverFn/x",
    "/api/badge",
  ]) {
    assert.equal(
      cacheableRequest(new Request(`https://example.test${path}`)),
      false,
    )
  }
  for (const headers of [
    { cookie: "session=x" },
    { authorization: "Bearer x" },
    { range: "bytes=0-1" },
  ]) {
    assert.equal(
      cacheableRequest(new Request("https://example.test/en", { headers })),
      false,
    )
  }
  assert.equal(
    cacheableRequest(
      new Request("https://example.test/en", { method: "POST" }),
    ),
    false,
  )
})
