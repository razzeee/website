import assert from "node:assert/strict"
import { parseArgs } from "node:util"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createPageCache } from "../../experiments/start/src/cache.server.mjs"
import { invalidatePages } from "../../experiments/start/src/cdn.server.mjs"

const { values } = parseArgs({ options: { output: { type: "string" } } })
if (!values.output || !process.env.REDIS_URL) {
  throw new Error("Provide --output and REDIS_URL")
}
const base = "http://127.0.0.1:3003"
const results = []
async function get(path, expected, headers, status = 200) {
  const response = await fetch(base + path, { headers, redirect: "manual" })
  const body = await response.text()
  assert.equal(response.status, status, path)
  assert.equal(response.headers.get("x-edge-cache"), expected, path)
  results.push({ path, expected, passed: true })
  return { response, body }
}
const cache = createPageCache({
  url: process.env.REDIS_URL,
  namespace: process.env.GITHUB_SHA || "prototype-v2",
})
async function purge(keys) {
  for (const key of keys) {
    const response = await fetch(base, {
      method: "PURGE",
      headers: { "X-Purge-Key": key },
    })
    assert.equal(response.status, 200)
  }
}
try {
  await invalidatePages(["/en", "/en/apps/org.mozilla.firefox"], {
    cache,
    purge,
  })
  const first = await get("/en", "MISS")
  const second = await get("/en", "HIT")
  assert.equal(first.body, second.body)
  assert.equal(
    /<meta name="(?:sentry-trace|baggage)"/.test(second.body),
    false,
    "CDN hit must not reuse origin trace metadata",
  )
  await get("/en", "HIT", { cookie: "NEXT_LOCALE=en" })
  for (const headers of [
    { cookie: "sandbox_session=valid" },
    { authorization: "Bearer test" },
  ]) {
    const { response } = await get("/en", "BYPASS", headers)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
  }
  await get("/en?query=test", "BYPASS")
  await get("/en/login/email/confirm", "BYPASS")
  await get("/en/settings", "BYPASS", undefined, 307)
  await get("/en/apps/org.mozilla.firefox", "MISS")
  const app = await get("/en/apps/org.mozilla.firefox", "HIT")
  assert.match(
    app.response.headers.get("surrogate-key"),
    /app-org.mozilla.firefox/,
  )
  await invalidatePages(["/en/apps/org.mozilla.firefox"], { cache, purge })
  const refilled = await get("/en/apps/org.mozilla.firefox", "MISS")
  assert.equal(refilled.response.headers.get("x-start-cache"), "MISS")
  await get("/en/apps/org.mozilla.firefox", "HIT")
  await get("/en", "HIT")
  for (const path of [
    "/zh-Hans/setup",
    "/nb-NO/about",
    "/en-GB/feeds",
    "/en/apps/collection/popular/1",
  ]) {
    await invalidatePages([path], { cache, purge })
    await get(path, "MISS")
    await get(path, "HIT")
    await get(path, "BYPASS", { cookie: "sandbox_session=valid" })
  }
  const asset = first.body.match(
    /(?:src|href)="(\/build-assets\/[^" ]+\.js)"/,
  )?.[1]
  assert.ok(asset, "HTML references hashed build assets")
  assert.equal((await fetch(base + asset, { method: "PURGE" })).status, 200)
  const assetFirst = await get(asset, "MISS")
  assert.equal(
    assetFirst.response.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  )
  await get(asset, "HIT")
  const fonts = new Set()
  for (const [, stylesheet] of first.body.matchAll(
    /href="(\/build-assets\/[^" ]+\.css)"/g,
  )) {
    assert.equal(
      (await fetch(base + stylesheet, { method: "PURGE" })).status,
      200,
    )
    const css = await get(stylesheet, "MISS")
    await get(stylesheet, "HIT")
    assert.equal(
      css.response.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    )
    assert.equal(
      css.body.includes("/_next/static/"),
      false,
      "Styles must not depend on Next-generated assets",
    )
    for (const font of css.body.match(/\/build-assets\/[^"'()\s]+\.woff2/g) ||
      []) {
      fonts.add(font)
    }
  }
  assert.equal(fonts.size, 7, "All Inter subsets are self-hosted")
  for (const font of fonts) {
    assert.equal((await fetch(base + font, { method: "PURGE" })).status, 200)
    const response = (await get(font, "MISS")).response
    assert.equal(
      response.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    )
    assert.match(response.headers.get("content-type"), /font\/woff2/)
    await get(font, "HIT")
  }
  await mkdir(values.output, { recursive: true })
  await writeFile(
    resolve(values.output, "cdn.json"),
    JSON.stringify(
      {
        scope:
          "Local Varnish proxy against the Start production build, not deployed Fastly configuration",
        results,
      },
      null,
      2,
    ),
  )
  console.log(`${results.length} edge checks passed`)
} finally {
  await cache.close()
}
