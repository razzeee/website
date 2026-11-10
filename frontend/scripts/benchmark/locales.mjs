import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { languages } from "../../src/i18n/locales.mjs"

const { values } = parseArgs({
  options: { output: { type: "string" }, "edge-base": { type: "string" } },
})
assert.ok(values.output, "Provide --output")
await mkdir(values.output, { recursive: true })
const next = "http://127.0.0.1:3000",
  start = "http://127.0.0.1:3001"
const cases = [
  ...[
    undefined,
    "de",
    "fr-CA,fr;q=0.9,en;q=0.2",
    "zh-TW",
    "zh-CN",
    "nb",
    "pt-PT",
    "pt-BR",
    "en-AU",
    "xx",
    "*",
    "invalid_value",
    "de;q=0,fr;q=1",
  ].map((language) => ({
    path: "/",
    headers: language ? { "accept-language": language } : {},
  })),
  ...["fr", "de", "en-GB", "zh-Hant", "invalid", "FR", "fr%2DCA", ""].map(
    (cookie) => ({
      path: "/about?x=1&x=2",
      headers: { cookie: `NEXT_LOCALE=${cookie}`, "accept-language": "ar" },
    }),
  ),
  ...languages.map((locale) => ({
    path: "/about",
    headers: { "accept-language": locale },
  })),
  ...["DE", "EN-gb", "ZH-hANT", "NB-no"].map((locale) => ({
    path: `/${locale}/about?q=1`,
    headers: { "accept-language": "fr", cookie: "NEXT_LOCALE=ar" },
  })),
  ...["document", "empty", "image"].map((destination) => ({
    path: "/",
    headers: { "sec-fetch-dest": destination },
  })),
  { path: "/settings?tab=history", headers: { "accept-language": "ar" } },
  {
    path: "/admin/users?filterString=test",
    headers: { cookie: "NEXT_LOCALE=de", "accept-language": "fr" },
  },
  {
    path: "/builds/apps/org.mozilla.firefox",
    headers: { "accept-language": "de" },
  },
  { path: "/apps/org.mozilla.firefox", headers: { "accept-language": "de" } },
  { path: "/about/", headers: { "accept-language": "de" } },
  { path: "/%09/evil", headers: { "accept-language": "de" } },
  { path: "/%5Cevil", headers: { "accept-language": "de" } },
]
const comparisons = [],
  edge = [],
  protectedPaths = []
const get = async (base, entry, method = "GET") => {
  const response = await fetch(base + entry.path, {
    method,
    headers: entry.headers,
    redirect: "manual",
  })
  await response.arrayBuffer()
  const location = response.headers.get("location")
  return {
    status: response.status,
    location: location
      ? new URL(location, base).pathname + new URL(location, base).search
      : null,
    cookie: response.headers.get("set-cookie"),
    cache: response.headers.get("cache-control"),
    vary: response.headers.get("vary"),
    edge: response.headers.get("x-edge-cache"),
  }
}
for (const entry of cases) {
  for (const method of ["GET", "HEAD"]) {
    const baseline = await get(next, entry, method)
    const candidate = await get(start, entry, method)
    assert.deepEqual(
      {
        status: candidate.status,
        location: candidate.location,
        cookie: candidate.cookie,
      },
      {
        status: baseline.status,
        location: baseline.location,
        cookie: baseline.cookie,
      },
      `${method} ${JSON.stringify(entry)}`,
    )
    if (candidate.status === 307) {
      assert.equal(candidate.cache, "private, no-store")
      assert.match(candidate.vary, /Accept-Language/)
      assert.match(candidate.vary, /Cookie/)
    }
    comparisons.push({ ...entry, method, baseline, candidate })
  }
}
if (values["edge-base"]) {
  for (let round = 0; round < 2; round++) {
    for (const headers of [
      { "accept-language": "de" },
      { "accept-language": "fr" },
      { cookie: "NEXT_LOCALE=ar", "accept-language": "de" },
      { cookie: "NEXT_LOCALE=zh-Hant", "accept-language": "de" },
    ]) {
      for (const path of ["/", "/about", "/settings?tab=history"]) {
        const expected = await get(start, { path, headers })
        const actual = await get(values["edge-base"], { path, headers })
        assert.equal(actual.location, expected.location)
        assert.equal(actual.cookie, expected.cookie)
        assert.equal(actual.cache, "private, no-store")
        assert.notEqual(actual.edge, "HIT")
        edge.push({ round, path, headers, actual })
      }
    }
  }
}
for (const [path, headers, login, returnTo] of [
  [
    "/settings?tab=history",
    { "accept-language": "ar" },
    "/ar/login",
    "/settings?tab=history",
  ],
  [
    "/admin/users?filterString=test",
    { cookie: "NEXT_LOCALE=de" },
    "/de/login/developer",
    "/admin/users?filterString=test",
  ],
]) {
  const localized = await get(start, { path, headers })
  const authorization = await get(start, { path: localized.location, headers })
  const target = new URL(authorization.location, start)
  assert.equal(target.pathname, login)
  assert.equal(target.searchParams.get("returnTo"), returnTo)
  assert.equal(authorization.cache, "private, no-store")
  protectedPaths.push({ path, localized, authorization })
}
await writeFile(
  resolve(values.output, "locales.json"),
  JSON.stringify({ comparisons, edge, protectedPaths }, null, 2),
)
console.log(
  `${comparisons.length} Next redirect/cookie comparisons, ${edge.length} edge isolation checks and ${protectedPaths.length} protected return paths passed`,
)
