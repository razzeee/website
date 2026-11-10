import { test } from "node:test"
import assert from "node:assert/strict"
import { localeRedirect } from "../src/locale-negotiation.server.mjs"
import { languages } from "../src/locales.mjs"
import { readFile } from "node:fs/promises"

const redirect = (path, headers = {}) =>
  localeRedirect(new Request(`https://example.test${path}`, { headers }))

test("locale negotiation prioritizes prefix, exact cookie, best-fit header and English fallback", () => {
  for (const [path, headers, target] of [
    ["/", {}, "/en"],
    ["/about?x=1", { "accept-language": "de" }, "/de/about?x=1"],
    ["/", { "accept-language": "zh-TW" }, "/zh-Hant"],
    ["/", { cookie: "NEXT_LOCALE=fr", "accept-language": "de" }, "/fr"],
    ["/", { cookie: "NEXT_LOCALE=FR", "accept-language": "de" }, "/de"],
    ["/", { "accept-language": "invalid_value" }, "/en"],
    ["/DE/about", { cookie: "NEXT_LOCALE=fr" }, "/de/about"],
    [
      "/settings?returnTo=%2Fwallet",
      { "accept-language": "ar" },
      "/ar/settings?returnTo=%2Fwallet",
    ],
  ]) {
    const response = redirect(path, headers)
    assert.equal(response.status, 307)
    assert.equal(response.headers.get("location"), target)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.match(response.headers.get("vary"), /Accept-Language, Cookie/)
  }
  for (const locale of languages) {
    assert.equal(redirect(`/${locale}/about`), null)
  }
})

test("negotiated redirect cookie sync follows navigation and fallback rules", () => {
  assert.equal(
    redirect("/").headers.get("set-cookie"),
    "NEXT_LOCALE=en; Path=/; SameSite=lax",
  )
  assert.equal(
    redirect("/", { "accept-language": "de" }).headers.get("set-cookie"),
    null,
  )
  assert.equal(
    redirect("/", {
      cookie: "NEXT_LOCALE=invalid",
      "accept-language": "de",
    }).headers.get("set-cookie"),
    "NEXT_LOCALE=de; Path=/; SameSite=lax",
  )
  assert.equal(
    redirect("/", { "sec-fetch-dest": "empty" }).headers.get("set-cookie"),
    null,
  )
})

test("negotiation excludes transports/assets/crawl paths and sanitizes local redirects", () => {
  for (const path of [
    "/api/badge",
    "/_serverFn/abc",
    "/build-assets/app.js",
    "/robots.txt",
    "/sitemap/0.xml",
    "/favicon.ico",
    "/.well-known/test",
    "/org.example.App",
    "/en/apps/org.example.App",
    "/about%ZZ",
  ]) {
    assert.equal(redirect(path), null, path)
  }
  assert.equal(
    redirect("/builds/apps/org.example.App", {
      "accept-language": "de",
    }).headers.get("location"),
    "/de/builds/apps/org.example.App",
  )
  for (const path of ["/%09/evil", "/%0a/evil", "/%5Cevil"]) {
    const response = redirect(path)
    assert.equal(
      new URL(response.headers.get("location"), "https://example.test").origin,
      "https://example.test",
    )
  }
})

test("edge cookie normalization is restricted to all canonical supported prefixes", async () => {
  const vcl = await readFile(
    new URL("../../../scripts/benchmark/cdn.vcl", import.meta.url),
    "utf8",
  )
  const pattern = vcl.match(/req\.url ~ "(\^\/\(en\|[^"\n]+)"/)[1]
  const prefixes = pattern.match(/^\^\/\(([^)]+)\)/)[1].split("|")
  assert.deepEqual(prefixes, languages)
  const localized = new RegExp(pattern)
  for (const locale of languages) {
    assert.equal(localized.test(`/${locale}/about`), true)
  }
  for (const path of [
    "/",
    "/about",
    "/settings",
    "/DE/about",
    "/english/about",
  ]) {
    assert.equal(localized.test(path), false, path)
  }
})
