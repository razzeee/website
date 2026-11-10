import { test } from "node:test"
import assert from "node:assert/strict"
import { languages } from "../src/locales.mjs"
import {
  applyCdnPolicy,
  invalidatePages,
  surrogateKeys,
} from "../src/cdn.server.mjs"

const request = (path = "/en", headers) =>
  new Request(`https://example.test${path}`, { headers })
const html = (headers = {}, status = 200) =>
  new Response(
    '<html><head><meta name="sentry-trace" content="old-trace"/><meta name="baggage" content="old-context"/></head><body>public</body></html>',
    { status, headers: { "content-type": "text/html", ...headers } },
  )

test("public CDN documents strip origin traces and preserve app purge keys", async () => {
  const response = await applyCdnPolicy(
    request("/en/apps/org.mozilla.firefox"),
    html({ etag: "old", "content-length": "100" }),
  )
  assert.match(
    response.headers.get("cache-control"),
    /public, max-age=0, s-maxage=300/,
  )
  assert.match(response.headers.get("surrogate-key"), /app-org.mozilla.firefox/)
  assert.match(response.headers.get("vary"), /Cookie/)
  assert.match(response.headers.get("vary"), /Authorization/)
  assert.equal(response.headers.has("etag"), false)
  assert.equal(response.headers.has("content-length"), false)
  assert.doesNotMatch(
    await response.text(),
    /old-trace|old-context|sentry-trace|baggage/,
  )
  assert.notDeepEqual(surrogateKeys("/en"), surrogateKeys("/de"))
})

test("credentials, queries, errors and private responses never become shared", async () => {
  for (const req of [
    request("/en", { cookie: "session=secret" }),
    request("/en", { authorization: "Bearer secret" }),
    request("/en?query=x"),
    request("/en/login/email/confirm"),
    request("/en/settings"),
    request("/_serverFn/test"),
  ]) {
    assert.equal(
      (await applyCdnPolicy(req, html())).headers.get("cache-control"),
      "private, no-store",
    )
  }
  for (const response of [
    html({ "set-cookie": "session=secret" }),
    html({ "cache-control": "private" }),
    html({ "cache-control": "no-store" }),
    html({ vary: "*" }),
    html({}, 404),
    html({}, 500),
  ]) {
    assert.equal(
      (await applyCdnPolicy(request(), response)).headers.get("cache-control"),
      "private, no-store",
    )
  }
  assert.match(
    (
      await applyCdnPolicy(request("/en", { cookie: "NEXT_LOCALE=en" }), html())
    ).headers.get("cache-control"),
    /public/,
  )
})

test("edge freshness is capped by the remaining origin HTML lifetime", async () => {
  const response = await applyCdnPolicy(request(), html(), Date.now() - 3590000)
  const ttl = Number(
    response.headers.get("cache-control").match(/s-maxage=(\d+)/)[1],
  )
  assert.ok(ttl <= 10 && ttl > 0)
  assert.equal(
    (await applyCdnPolicy(request(), html(), Date.now() - 3600001)).headers.get(
      "cache-control",
    ),
    "private, no-store",
  )
})

test("origin invalidation precedes edge purge and purge failures surface", async () => {
  const calls = []
  const cache = { invalidate: async (path) => calls.push(path) }
  const paths = ["/en", "/en/apps/org.mozilla.firefox"]
  await invalidatePages(paths, {
    cache,
    purge: async (keys) => {
      assert.deepEqual(calls, [
        "/en",
        ...languages.map((locale) => `/${locale}/apps/org.mozilla.firefox`),
      ])
      assert.ok(keys.includes("app-org.mozilla.firefox"))
      assert.ok(!keys.includes("start-pages"))
    },
  })
  await assert.rejects(
    invalidatePages(paths, {
      cache,
      purge: async () => {
        throw new Error("purge unavailable")
      },
    }),
    /purge unavailable/,
  )
})
