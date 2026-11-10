import assert from "node:assert/strict"
import { chromium } from "playwright"
import { parseArgs } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { createCspProxy } from "./csp-proxy.mjs"
import {
  purchaseApp,
  donationApp,
  publishedYear,
  installStripeFixture,
} from "./protected-fixtures.mjs"

const { values } = parseArgs({
  options: {
    output: { type: "string" },
    assets: { type: "string" },
    "edge-base": { type: "string" },
    "next-base": { type: "string" },
  },
})
assert.ok(values.output && values.assets, "Provide --output and --assets")
await mkdir(values.output, { recursive: true })
const origin = "http://127.0.0.1:3001"
const currentYear = new Date().getUTCFullYear(),
  publicYear = publishedYear()
const preview = currentYear > publicYear
const purchases = (app) => [
  `/en/apps/${app.id}/purchase`,
  `/en/apps/purchase/${app.id}`,
]
const documents = [],
  edges = [],
  journeys = [],
  comparisons = []
const browser = await chromium.launch()
const parser = await browser.newPage()
const metadata = async (body) =>
  parser.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, "text/html")
    const normalized = (value) =>
      value
        ?.replace(/http:\/\/127\.0\.0\.1:300[01]/g, "http://site.test")
        .replace(
          /https:\/\/dl\.flathub\.org\/assets\/_next\/static\/media\/card\.[^" ]+\.webp/g,
          "http://site.test/img/card.webp",
        )
    const meta = (selector) =>
      normalized(doc.querySelector(selector)?.getAttribute("content"))
    return {
      lang: doc.documentElement.lang,
      dir: doc.documentElement.dir,
      title: doc.title,
      robots: meta('meta[name="robots"]'),
      canonical: normalized(
        doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      ),
      ogTitle: meta('meta[property="og:title"]'),
      ogDescription: meta('meta[property="og:description"]'),
      ogUrl: meta('meta[property="og:url"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogWidth: meta('meta[property="og:image:width"]'),
      ogHeight: meta('meta[property="og:image:height"]'),
      twitterTitle: meta('meta[name="twitter:title"]'),
      twitterImage: meta('meta[name="twitter:image"]'),
    }
  }, body)
let proxy
try {
  for (const server of [origin, values["edge-base"]].filter(Boolean)) {
    for (const app of [purchaseApp, donationApp]) {
      for (const path of purchases(app)) {
        for (const session of [null, "expired", "valid"]) {
          const response = await fetch(server + path, {
            redirect: "manual",
            headers: session ? { cookie: `sandbox_session=${session}` } : {},
          })
          const body = await response.text()
          assert.equal(response.status, session === "valid" ? 200 : 307, path)
          assert.equal(
            response.headers.get("cache-control"),
            "private, no-store",
            path,
          )
          assert.equal(response.headers.has("surrogate-key"), false, path)
          assert.equal(response.headers.get("x-start-cache"), "BYPASS", path)
          if (server !== origin) {
            assert.equal(response.headers.get("x-edge-cache"), "BYPASS", path)
          }
          if (session !== "valid") {
            const target = new URL(response.headers.get("location"), server)
            assert.equal(target.pathname, "/en/login")
            assert.equal(target.searchParams.get("returnTo"), path.slice(3))
          } else {
            const head = await metadata(body)
            assert.equal(
              head.title,
              `${app.id === donationApp.id ? "Donate to" : "Purchase"} ${app.name} | Flathub`,
            )
            assert.equal(head.robots, "noindex, nofollow")
            if (server === origin && values["next-base"]) {
              const baseline = await fetch(values["next-base"] + path, {
                headers: { cookie: "sandbox_session=valid" },
              })
              assert.equal(baseline.status, 200, path)
              assert.deepEqual(
                head,
                await metadata(await baseline.text()),
                path,
              )
              comparisons.push({ path, passed: true })
            }
          }
          ;(server === origin ? documents : edges).push({
            path,
            session: session || "anonymous",
            status: response.status,
          })
        }
      }
    }
    for (const year of [publicYear, currentYear, 2017, currentYear + 1]) {
      for (const session of [null, "valid", "moderator", "curator"]) {
        const path = `/en/year-in-review/${year}`
        const expected =
          year >= 2018 &&
          year <= currentYear &&
          (year <= publicYear || session === "curator")
            ? 200
            : 404
        const response = await fetch(server + path, {
          headers: session ? { cookie: `sandbox_session=${session}` } : {},
        })
        const body = await response.text()
        assert.equal(response.status, expected, `${path} ${session}`)
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
          path,
        )
        assert.equal(response.headers.has("surrogate-key"), false, path)
        assert.equal(response.headers.get("x-start-cache"), "BYPASS", path)
        if (server !== origin) {
          assert.equal(response.headers.get("x-edge-cache"), "BYPASS", path)
        }
        if (expected === 200) {
          const head = await metadata(body)
          assert.equal(head.title, `${year} Year in Review | Flathub`)
          assert.equal(
            head.canonical,
            `http://site.test/en/year-in-review/${year}`,
          )
          assert.equal(head.ogUrl, head.canonical)
          assert.equal(
            head.ogImage,
            `http://site.test/api/yearInReviewOgImage/${year}?locale=en`,
          )
          assert.equal(head.twitterImage, head.ogImage)
          assert.equal(head.ogTitle, `${year} Year in Review - Flathub`)
          assert.equal(head.twitterTitle, head.ogTitle)
          assert.equal(head.ogWidth, "1200")
          assert.equal(head.ogHeight, "630")
          if (server === origin && values["next-base"]) {
            const baseline = await fetch(values["next-base"] + path, {
              headers: session ? { cookie: `sandbox_session=${session}` } : {},
            })
            assert.equal(baseline.status, 200, path)
            assert.deepEqual(head, await metadata(await baseline.text()), path)
            comparisons.push({
              path,
              session: session || "anonymous",
              passed: true,
            })
          }
        }
        ;(server === origin ? documents : edges).push({
          path,
          session: session || "anonymous",
          status: response.status,
        })
      }
    }
  }
  for (const locale of ["de", "ar"]) {
    const path = `/${locale}/year-in-review/${publicYear}`
    const response = await fetch(origin + path)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(response.headers.get("x-start-cache"), "BYPASS")
    const head = await metadata(await response.text())
    assert.equal(head.lang, locale)
    assert.equal(head.dir, locale === "ar" ? "rtl" : "ltr")
    assert.equal(head.canonical, `http://site.test${path}`)
    assert.equal(
      head.ogImage,
      `http://site.test/api/yearInReviewOgImage/${publicYear}?locale=${locale}`,
    )
    if (values["next-base"]) {
      const baseline = await fetch(values["next-base"] + path)
      assert.equal(baseline.status, 200)
      assert.deepEqual(head, await metadata(await baseline.text()), path)
      comparisons.push({ path, passed: true })
    }
    documents.push({ path, status: 200 })
  }
  if (preview) {
    const responses = await Promise.all(
      ["curator", "valid", "moderator", "curator", "expired"].map(
        async (session) => {
          const response = await fetch(
            `${origin}/en/year-in-review/${currentYear}`,
            { headers: { cookie: `sandbox_session=${session}` } },
          )
          await response.text()
          return { session, status: response.status }
        },
      ),
    )
    for (const response of responses) {
      assert.equal(response.status, response.session === "curator" ? 200 : 404)
    }
    documents.push({ concurrentPreviewIsolation: responses })
  }
  const yearRequests = (
    await (await fetch("http://127.0.0.1:4101/__sandbox/events")).json()
  ).filter((event) => event.kind === "year-review")
  assert.ok(yearRequests.some((event) => event.year === publicYear))
  assert.ok(
    yearRequests
      .filter((event) => event.year <= publicYear)
      .every((event) => !event.cookieForwarded),
    "Public year requests must not forward session cookies",
  )
  if (preview) {
    assert.ok(
      yearRequests.some(
        (event) =>
          event.year === currentYear &&
          event.session === "curator" &&
          event.cookieForwarded,
      ),
      "Preview must forward the actual session",
    )
  }

  proxy = await createCspProxy(origin)
  const base = proxy.base
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
      reducedMotion: "reduce",
      serviceWorkers: "block",
    })
    await context.addInitScript((theme) => {
      if (location.protocol === "http:") {
        localStorage.setItem("theme", theme)
      }
    }, variant.colorScheme)
    await context.addInitScript(installStripeFixture)
    const errors = [],
      writes = []
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (url.hostname.endsWith("stripe.com")) {
        errors.push("Live Stripe traffic is forbidden")
        return route.abort()
      }
      if (url.hostname === "webstats.gnome.org") {
        return route.fulfill({ status: 200, body: "" })
      }
      if (url.hostname === "127.0.0.1") {
        if (url.port === "4101") {
          if (
            !["GET", "OPTIONS"].includes(request.method()) &&
            !url.pathname.includes("envelope")
          ) {
            assert.equal(url.pathname, `/vendingapp/${purchaseApp.id}`)
            writes.push(request.postDataJSON())
          }
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
      } catch {
        return route.abort()
      }
    })
    const page = await context.newPage()
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource:")
      ) {
        errors.push(message.text())
      }
    })
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(
          `HTTP ${response.status()} ${new URL(response.url()).pathname}`,
        )
      }
    })
    const visit = async (path) => {
      await page.goto("about:blank")
      await page.goto(base + path, { waitUntil: "domcontentloaded" })
    }
    await context.addCookies([
      { name: "sandbox_session", value: "valid", url: base },
    ])
    for (const app of [purchaseApp, donationApp]) {
      for (const [index, path] of purchases(app).entries()) {
        await visit(path)
        await page
          .getByRole("heading", {
            name: `${app.id === donationApp.id ? "Donate to" : "Purchase"} ${app.name}`,
            exact: true,
          })
          .waitFor()
        const button = page.getByRole("button", {
          name: app.id === donationApp.id ? "Donate" : "Purchase",
          exact: true,
        })
        await button.waitFor()
        const input = page.locator('main input[inputmode="numeric"]')
        await input.fill("0")
        assert.equal(await button.isDisabled(), true)
        await input.fill("5")
        await input.press("Tab")
        assert.equal(await button.isEnabled(), true)
        if (app.id === purchaseApp.id) {
          await page.screenshot({
            path: resolve(
              values.output,
              `${variant.name}-purchase-${index}.png`,
            ),
            animations: "disabled",
          })
          await button.click()
          await page.waitForURL("**/en/payment/123")
          await page.locator("#purchase-terms-confirm").waitFor()
        }
      }
    }
    if (preview) {
      await context.addCookies([
        { name: "sandbox_session", value: "curator", url: base },
      ])
      await visit(`/en/year-in-review/${currentYear}`)
      await page
        .getByRole("heading", {
          name: `${currentYear} Year in Review`,
          exact: true,
        })
        .waitFor()
    }
    await context.clearCookies()
    await visit(`/en/year-in-review/${publicYear}`)
    await page
      .getByRole("heading", {
        name: `${publicYear} Year in Review`,
        exact: true,
      })
      .waitFor()
    await page.screenshot({
      path: resolve(values.output, `${variant.name}-year-in-review.png`),
      animations: "disabled",
    })
    if (publicYear > 2018) {
      await page
        .locator(`a[href="/en/year-in-review/${publicYear - 1}"]`)
        .first()
        .click()
      await page.waitForURL(`**/en/year-in-review/${publicYear - 1}`)
      await page
        .getByRole("heading", {
          name: `${publicYear - 1} Year in Review`,
          exact: true,
        })
        .waitFor()
    }
    assert.deepEqual(writes, [
      { currency: "usd", amount: 500 },
      { currency: "usd", amount: 500 },
    ])
    assert.deepEqual(errors, [], variant.name)
    journeys.push({
      variant: variant.name,
      paidAndDonationRendering: "passed",
      amountValidation: "passed",
      purchaseToPaymentRedirects: "passed",
      yearRenderingAndNavigation: "passed",
      authorizedYearPreview: preview
        ? "passed"
        : "not applicable after public release",
      localPurchaseIntents: writes.length,
    })
    await context.close()
  }
  console.log(
    `${documents.length} document/isolation cases, ${edges.length} edge bypass checks, ${comparisons.length} metadata comparisons and ${journeys.length} browser suites passed`,
  )
} finally {
  await browser.close()
  if (proxy) {
    await proxy.close()
  }
  await writeFile(
    resolve(values.output, "final-routes.json"),
    JSON.stringify(
      {
        publicYear,
        currentYear,
        preview,
        documents,
        edges,
        comparisons,
        journeys,
      },
      null,
      2,
    ),
  )
}
