import assert from "node:assert/strict"
import { chromium } from "playwright"
import { parseArgs } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { createCspProxy } from "./csp-proxy.mjs"

const { values } = parseArgs({
  options: {
    output: { type: "string" },
    assets: { type: "string" },
    "edge-base": { type: "string" },
  },
})
assert.ok(values.output && values.assets, "Provide --output and --assets")
await mkdir(values.output, { recursive: true })
const origin = "http://127.0.0.1:3001"
const initialFixtures = await (
  await fetch("http://127.0.0.1:4101/__fixtures/stats")
).json()
const proxy = await createCspProxy(values["edge-base"] || origin)
const base = proxy.base
const browser = await chromium.launch()
const journeys = [],
  edge = []
let fixtureVerification
try {
  for (const variant of [
    {
      name: "desktop-light",
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    },
    {
      name: "desktop-dark",
      viewport: { width: 1440, height: 900 },
      colorScheme: "dark",
    },
    {
      name: "mobile-light",
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
      isMobile: true,
    },
    {
      name: "mobile-dark",
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      isMobile: true,
    },
  ]) {
    const context = await browser.newContext({
      ...variant,
      locale: "en-US",
      serviceWorkers: "block",
    })
    await context.addInitScript((theme) => {
      if (location.protocol === "http:") {
        localStorage.setItem("theme", theme)
      }
    }, variant.colorScheme)
    const errors = [],
      transports = [],
      switches = []
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (url.hostname === "webstats.gnome.org") {
        return route.fulfill({ status: 200, body: "" })
      }
      if (url.hostname === "127.0.0.1") {
        if (url.port === "4101") {
          const response = await route.fetch()
          return route.fulfill({
            response,
            headers: {
              ...response.headers(),
              "access-control-allow-origin": base,
              "access-control-allow-credentials": "true",
            },
          })
        }
        return route.continue()
      }
      try {
        if (
          url.hostname === "dl.flathub.org" &&
          url.pathname.startsWith("/assets/_next/public/")
        ) {
          return route.fulfill({
            path: resolve(
              "public",
              url.pathname.slice("/assets/_next/public/".length),
            ),
          })
        }
        const saved = JSON.parse(
          await readFile(
            resolve(
              values.assets,
              createHash("sha256").update(url.href).digest("hex") + ".json",
            ),
            "utf8",
          ),
        )
        return route.fulfill({
          contentType: saved.contentType,
          body: Buffer.from(saved.body, "base64"),
        })
      } catch (error) {
        errors.push(`Missing asset fixture: ${url.href}: ${error.message}`)
        return route.abort()
      }
    })
    const page = await context.newPage()
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text())
      }
    })
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(`HTTP ${response.status()} ${response.url()}`)
      }
      if (response.url().includes("/_serverFn/")) {
        transports.push({ cache: response.headers()["cache-control"] })
      }
    })
    const preference = async () =>
      (await context.cookies(base)).find(
        (cookie) => cookie.name === "NEXT_LOCALE",
      )
    const visit = async (path) => {
      await page.goto("about:blank")
      return page.goto(base + path, { waitUntil: "domcontentloaded" })
    }
    const language = async (locale) => {
      await page.waitForFunction(
        (expected) => document.documentElement.lang === expected,
        locale,
      )
      assert.equal(
        await page.locator("html").getAttribute("dir"),
        locale === "ar" ? "rtl" : "ltr",
      )
    }

    await visit("/en/languages")
    await page.locator('main a[href="/de"]').waitFor()
    assert.equal(
      await preference(),
      undefined,
      "Rendering language links must not create a preference",
    )
    for (const locale of ["de", "ar", "zh-Hant", "en"]) {
      const previous = await preference()
      const link = page.locator(`main a[href="/${locale}"]`)
      assert.equal(await link.getAttribute("hreflang"), locale)
      await link.hover()
      assert.deepEqual(
        await preference(),
        previous,
        "Hover must not overwrite the preference",
      )
      await link.click()
      await page.waitForURL(`**/${locale}`)
      await language(locale)
      const cookie = await preference()
      assert.equal(cookie.value, locale)
      assert.equal(cookie.path, "/")
      assert.equal(cookie.sameSite, "Lax")
      assert.equal(cookie.httpOnly, false)
      assert.equal(cookie.expires, -1)
      const revisit = await visit("/about?source=language-switch")
      assert.equal(new URL(page.url()).pathname, `/${locale}/about`)
      assert.equal(new URL(page.url()).search, "?source=language-switch")
      await language(locale)
      assert.equal(
        revisit.request().redirectedFrom()?.url(),
        base + "/about?source=language-switch",
      )
      switches.push({
        locale,
        cookie: {
          value: cookie.value,
          path: cookie.path,
          sameSite: cookie.sameSite,
          expires: cookie.expires,
        },
        unprefixedRevisit: "passed",
        direction: locale === "ar" ? "rtl" : "ltr",
      })
      await visit(`/${locale}/languages`)
      await page.locator('main a[href="/de"]').waitFor()
    }

    // Ordinary links must not reset a preference selected in another tab.
    await visit("/de/languages")
    await page.locator('main a[href="/ar"]').waitFor()
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "ar", url: base, sameSite: "Lax" },
    ])
    await page.locator('a[href="/de/about"]').last().click()
    await page.waitForURL("**/de/about")
    await language("de")
    assert.equal((await preference()).value, "ar")
    await visit("/about")
    assert.equal(new URL(page.url()).pathname, "/ar/about")
    await language("ar")
    assert.ok(
      transports.length > 0,
      "Switching must exercise client navigation",
    )
    assert.ok(
      transports.every((transport) => transport.cache === "private, no-store"),
    )
    assert.deepEqual(errors, [], variant.name)
    journeys.push({
      variant: variant.name,
      switches,
      ordinaryNavigationPreservesPreference: "passed",
      privateServerFunctionRequests: transports.length,
    })
    await context.close()
  }

  if (values["edge-base"]) {
    for (const locale of ["en", "de", "ar", "zh-Hant"]) {
      const path = `/${locale}/about`
      const purge = await fetch(values["edge-base"] + path, { method: "PURGE" })
      await purge.text()
      assert.equal(purge.status, 200)
      for (const [index, preference] of [
        null,
        "de",
        "ar",
        "zh-Hant",
        "en",
      ].entries()) {
        const response = await fetch(values["edge-base"] + path, {
          headers: preference ? { cookie: `NEXT_LOCALE=${preference}` } : {},
        })
        const body = await response.text()
        assert.equal(response.status, 200)
        assert.match(response.headers.get("cache-control"), /public.*s-maxage=/)
        assert.equal(response.headers.has("set-cookie"), false)
        assert.equal(
          response.headers.get("x-edge-cache"),
          index === 0 ? "MISS" : "HIT",
        )
        assert.ok(body.includes(`lang="${locale}"`))
        edge.push({
          path,
          preference,
          state: response.headers.get("x-edge-cache"),
        })
      }
    }
    for (const preference of ["de", "ar", "zh-Hant", "en"]) {
      const response = await fetch(values["edge-base"] + "/about", {
        headers: {
          cookie: `NEXT_LOCALE=${preference}`,
          "accept-language": "fr",
        },
        redirect: "manual",
      })
      await response.text()
      assert.equal(response.status, 307)
      assert.equal(
        new URL(response.headers.get("location"), base).pathname,
        `/${preference}/about`,
      )
      assert.equal(response.headers.get("cache-control"), "private, no-store")
      assert.notEqual(response.headers.get("x-edge-cache"), "HIT")
      edge.push({
        path: "/about",
        preference,
        state: response.headers.get("x-edge-cache"),
        target: `/${preference}/about`,
      })
    }
  }
  const finalFixtures = await (
    await fetch("http://127.0.0.1:4101/__fixtures/stats")
  ).json()
  const newMisses = finalFixtures.misses.slice(initialFixtures.misses.length)
  assert.deepEqual(
    newMisses,
    [],
    "Language-switch destinations must have complete API fixtures",
  )
  fixtureVerification = {
    newMisses,
    initialMissCount: initialFixtures.misses.length,
    finalMissCount: finalFixtures.misses.length,
  }
  console.log(
    `${journeys.length} browser language-switch suites, ${journeys.reduce((count, row) => count + row.switches.length, 0)} preference/revisit checks and ${edge.length} CDN isolation checks passed`,
  )
} finally {
  await browser.close()
  await proxy.close()
  await writeFile(
    resolve(values.output, "language-switch.json"),
    JSON.stringify({ journeys, edge, fixtureVerification }, null, 2),
  )
}
