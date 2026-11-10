import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { resolve } from "node:path"

const { values } = parseArgs({ options: { output: { type: "string" } } })
if (!values.output) {
  throw new Error("Provide --output")
}
await mkdir(values.output, { recursive: true })
const cases = [
  ["/api/badge?svg", 200],
  ["/api/badge", 200],
  ["/api/badge?locale=ar&svg", 200],
  ["/api/badge?size=bogus", 400],
  ["/api/badge?locale=invalid", 400],
  ["/api/appOgImage/org.mozilla.firefox?svg", 200],
  ["/api/yearInReviewOgImage/1900?svg", 400],
  ["/api/yearInReviewOgImage/2025?svg", 200],
  ["/home", 308],
  ["/en/apps/category/graphics", 308],
  ["/apps/details/org.mozilla.firefox", 308],
  ["/en/apps/org.mozilla.firefox/flatpakhttps", 307],
]
const results = []
for (const [path, status] of cases) {
  const arms = []
  for (const port of [3000, 3001]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    })
    const body = Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, status, `${port} ${path}`)
    arms.push({
      status: response.status,
      hash: createHash("sha256").update(body).digest("hex"),
      bytes: body.length,
      contentType: response.headers.get("content-type")?.replaceAll("; ", ";"),
      location: response.headers
        .get("location")
        ?.replace(/^http:\/\/127\.0\.0\.1:300[01]/, ""),
      headers: Object.fromEntries(
        [
          "x-frame-options",
          "x-content-type-options",
          "referrer-policy",
          "content-security-policy",
          "permissions-policy",
        ].map((key) => [key, response.headers.get(key)]),
      ),
    })
  }
  if (status < 300 || status >= 400) {
    for (const [index, port] of [3000, 3001].entries()) {
      assert.ok(
        arms[index].headers["content-security-policy"].includes(
          `base-uri 'self' http://127.0.0.1:${port};`,
        ),
      )
    }
    const normalized = (headers) => ({
      ...headers,
      "content-security-policy": headers["content-security-policy"].replace(
        /http:\/\/127\.0\.0\.1:300[01]/g,
        "http://local-site",
      ),
    })
    assert.deepEqual(
      normalized(arms[1].headers),
      normalized(arms[0].headers),
      `${path} security headers`,
    )
    assert.equal(arms[1].hash, arms[0].hash, `${path} response bytes`)
    assert.equal(
      arms[1].contentType,
      arms[0].contentType,
      `${path} content type`,
    )
  } else {
    assert.equal(arms[1].location, arms[0].location, `${path} redirect`)
  }
  results.push({ path, arms, passed: true })
}
const first = await (await fetch("http://127.0.0.1:3001/en")).text()
const secondResponse = await fetch("http://127.0.0.1:3001/en")
const second = await secondResponse.text()
assert.equal(secondResponse.headers.get("x-start-cache"), "HIT")
const trace = (body) => body.match(/name="sentry-trace" content="([^"]+)"/)?.[1]
assert.equal(
  trace(first),
  undefined,
  "Shared HTML must not retain origin trace context",
)
assert.equal(
  trace(second),
  undefined,
  "Shared HTML must not retain origin trace context",
)
await writeFile(
  resolve(values.output, "endpoints.json"),
  JSON.stringify(
    {
      results,
      cacheTraceIsolation: true,
      note: "Native app image uses live external image assets; not a timing benchmark.",
    },
    null,
    2,
  ),
)
console.log(
  `${results.length} endpoint/redirect pairs and cached trace isolation passed`,
)
