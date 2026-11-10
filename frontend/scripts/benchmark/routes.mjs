import { chromium } from "playwright"
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { output: { type: "string" } } })
assert.ok(values.output, "Provide --output")
const paths = [
  "/en/builds",
  "/en/builds/reproducible",
  "/en/builds/123",
  "/en/builds/apps/org.mozilla.firefox",
  "/en/500",
  "/ar/unauthorized",
  "/en/statistics",
  "/en/apps/org.mozilla.firefox/bannerpreview",
  ...["en", "de", "ar", "en-GB", "nb-NO", "zh-Hans", "zh-Hant"].flatMap(
    (locale) =>
      [
        "about",
        "setup",
        "setup/Ubuntu",
        "feeds",
        "languages",
        "badges",
        "consultants",
        "privacy-policy",
        "terms-and-conditions",
      ].map((path) => `/${locale}/${path}`),
  ),
  ...[
    "popular",
    "trending",
    "verified",
    "mobile",
    "recently-added",
    "recently-updated",
    "developer/Mozilla",
    "tag/Utility",
  ].map((collection) => `/en/apps/collection/${collection}/1`),
  "/en/apps/category/game/subcategories/Emulator/1",
  "/en/apps/org.mozilla.firefox",
  "/en/apps/org.mozilla.firefox/install",
]
const browser = await chromium.launch()
const page = await browser.newPage()
const results = []
const statusResults = []
try {
  for (const path of paths) {
    const arms = []
    for (const port of [3000, 3001]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`)
      const html = await response.text()
      const parsed = await page.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html")
        const normalize = (s) =>
          s
            .replace(/http:\/\/127\.0\.0\.1:300[01]/g, "http://site.test")
            .replace(
              /https:\/\/dl\.flathub\.org\/assets\/_next\/static\/media\/card\.[^" ]+\.webp/g,
              "http://site.test/img/card.webp",
            )
            .replace(
              /https:\/\/dl\.flathub\.org\/assets\/_next\/static\/media\/logo-horizontal-email\.[^" ]+\.png/g,
              "/img/logo/logo-horizontal-email.png",
            )
        const metadata = [...doc.querySelectorAll("meta[name], meta[property]")]
          .filter((m) =>
            /^(description|robots|author|og:|twitter:)/.test(
              m.name || m.getAttribute("property"),
            ),
          )
          .map((m) => [
            m.name || m.getAttribute("property"),
            normalize(m.content),
          ])
          .sort()
        const links = [
          ...doc.querySelectorAll(
            'link[rel="canonical"], link[rel="alternate"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="preconnect"]',
          ),
        ]
          .map((link) => [
            link.rel,
            normalize(link.getAttribute("href")),
            link.type,
            link.title,
            link.getAttribute("sizes"),
          ])
          .sort()
        return {
          title: doc.title,
          lang: doc.documentElement.lang,
          dir: doc.documentElement.dir,
          metadata,
          links: [
            ...new Map(
              links.map((link) => [JSON.stringify(link), link]),
            ).values(),
          ],
          headings: [...doc.querySelectorAll("h1, h2, h3")].map(
            (h) => h.textContent,
          ),
          structuredData: [
            ...doc.querySelectorAll('script[type="application/ld+json"]'),
          ]
            .map((s) => JSON.parse(normalize(s.textContent)))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        }
      }, html)
      arms.push({ status: response.status, ...parsed })
    }
    const differences = Object.keys(arms[0]).filter((key) => {
      try {
        assert.deepEqual(arms[1][key], arms[0][key])
        return false
      } catch {
        return true
      }
    })
    results.push({ path, arms, differences })
  }
  for (const [path, expected] of [
    ...["en", "de", "ar", "en-GB", "nb-NO", "zh-Hans", "zh-Hant"].flatMap(
      (locale) => [
        [`/${locale}/apps/collection/popular`, 308],
        [`/${locale}/apps/category/graphics`, 308],
      ],
    ),
    ["/en/about/extra", 404],
    ["/en/apps/search/extra", 404],
    ["/en/apps/category/graphics/1/extra", 404],
    ["/en/setup/not-a-distro", 404],
    ["/en/apps/collection/popular/0", 404],
  ]) {
    const arms = []
    for (const port of [3000, 3001]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        redirect: "manual",
      })
      await response.text()
      arms.push({
        status: response.status,
        location: response.headers
          .get("location")
          ?.replace(/^http:\/\/127\.0\.0\.1:300[01]/, ""),
      })
    }
    assert.equal(arms[0].status, expected, path)
    assert.deepEqual(arms[1], arms[0], path)
    statusResults.push({ path, arms })
  }
} finally {
  await browser.close()
}
await mkdir(values.output, { recursive: true })
await writeFile(
  resolve(values.output, "routes.json"),
  JSON.stringify(results, null, 2),
)
await writeFile(
  resolve(values.output, "route-status.json"),
  JSON.stringify(statusResults, null, 2),
)
for (const result of results) {
  if (result.differences.length || result.arms.some((a) => a.status !== 200)) {
    console.log(
      result.path,
      result.arms.map((a) => a.status),
      result.differences,
    )
  }
}
assert.ok(
  results.every(
    (r) => !r.differences.length && r.arms.every((a) => a.status === 200),
  ),
  "Route parity failures, see routes.json",
)
console.log(`${results.length} route/locale/metadata comparisons passed`)
console.log(`${statusResults.length} redirect/not-found comparisons passed`)
