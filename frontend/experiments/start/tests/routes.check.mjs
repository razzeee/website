import { test } from "node:test"
import assert from "node:assert/strict"
import { languages, localized, withoutLocale } from "../src/locales.mjs"
import { matchPublicRoute } from "../src/public-routes.mjs"
import { publicPage } from "../src/cache.server.mjs"
import { surrogateKeys } from "../src/cdn.server.mjs"
import { metadataHead } from "../src/metadata.mjs"

test("every supported locale switches without duplicating path prefixes", () => {
  for (const locale of languages) {
    assert.equal(withoutLocale(`/${locale}/setup`), "/setup")
    assert.equal(
      localized("/zh-Hans/setup?q=a#steps", locale),
      `/${locale}/setup?q=a#steps`,
    )
    assert.equal(localized("/nb-NO", locale), `/${locale}`)
    assert.equal(publicPage(`/${locale}/apps/org.mozilla.firefox`), true)
    assert.ok(
      surrogateKeys(`/${locale}/apps/org.mozilla.firefox`).includes(
        "app-org.mozilla.firefox",
      ),
    )
  }
  assert.equal(withoutLocale("/xx/setup"), "/xx/setup")
  assert.equal(localized("//example.test/path", "ar"), "//example.test/path")
  assert.equal(
    localized(
      {
        pathname: "/apps/search",
        query: { q: "a b", filter: ["x", "y"] },
        hash: "#results",
      },
      "zh-Hant",
    ),
    "/zh-Hant/apps/search?q=a+b&filter=x&filter=y#results",
  )
})

test("public routes require complete shapes and exclude private caching", () => {
  assert.equal(
    matchPublicRoute(["builds", "reproducible"]).kind,
    "builds-reproducible",
  )
  for (const path of [
    "/en/builds",
    "/en/builds/123",
    "/en/500",
    "/ar/unauthorized",
    "/en/apps/org.mozilla.firefox/bannerpreview",
  ]) {
    assert.equal(publicPage(path), false, path)
  }
  assert.deepEqual(
    matchPublicRoute("apps/collection/developer/Example%20Author/2".split("/")),
    {
      kind: "developer-collection",
      params: { developer: "Example%20Author", page: "2" },
    },
  )
  assert.equal(matchPublicRoute("setup/ubuntu/extra".split("/")), undefined)
  for (const path of [
    "/zh-Hans/setup",
    "/nb-NO/apps/collection/popular/2",
    "/en/apps/category/game/subcategories/Emulator/1",
  ]) {
    assert.equal(publicPage(path), true, path)
  }
  for (const path of [
    "/xx/setup",
    "/en/settings",
    "/en/apps/search",
    "/en/setup?q=x",
    "/en/apps/collection/popular/0",
    "/en/apps/collection/popular/1/extra",
    "/en/apps/org.mozilla.firefox/install",
  ]) {
    assert.equal(publicPage(path), false, path)
  }
})

test("metadata inherits defaults but replaces nested robots and Open Graph", () => {
  const parent = {
    metadataBase: new URL("https://example.test"),
    title: { template: "%s | Translated", default: "Default title" },
    description: "Default description",
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "en_GB",
      images: [{ url: "/card.webp" }],
    },
    twitter: { card: "summary_large_image" },
  }
  const head = metadataHead(parent, {
    title: "App",
    robots: { index: true },
    openGraph: {
      url: "/apps/test",
      images: [{ url: "/app.webp", width: 1200, alt: "App image" }],
    },
    alternates: { canonical: "/apps/test" },
  })
  assert.deepEqual(head.meta[0], { title: "App | Translated" })
  assert.ok(head.meta.some((m) => m.name === "robots" && m.content === "index"))
  assert.ok(!head.meta.some((m) => m.property === "og:locale"))
  assert.ok(
    head.meta.some(
      (m) =>
        m.name === "twitter:image" &&
        m.content === "https://example.test/app.webp",
    ),
  )
  assert.deepEqual(head.links, [
    { rel: "canonical", href: "https://example.test/apps/test" },
  ])
  assert.deepEqual(metadataHead(parent, {}).meta[0], { title: "Default title" })
  assert.deepEqual(
    metadataHead(parent, { title: { absolute: "Absolute" } }).meta[0],
    { title: "Absolute" },
  )
})
