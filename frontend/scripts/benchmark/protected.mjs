import assert from "node:assert/strict"
import { chromium } from "playwright"
import { parseArgs } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { createCspProxy } from "./csp-proxy.mjs"
import { protectedRoutes } from "../../experiments/start/src/protected-routes.mjs"
import { installStripeFixture } from "./protected-fixtures.mjs"

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
assert.equal(
  (
    await fetch("http://127.0.0.1:4101/__sandbox/reset-apps", {
      method: "POST",
    })
  ).status,
  200,
)
let base = origin
const results = []
for (const [kind, pattern] of [...protectedRoutes, ["settings", "settings"]]) {
  const path = `/en/${pattern.replace(/:[^/]+/g, (param) => (param === ":appId" ? (kind.startsWith("app-purchase") ? "org.example.PurchaseSandbox" : "org.example.Sandbox") : "123"))}`
  for (const session of [null, "expired", "valid", "admin", "moderator"]) {
    const response = await fetch(base + path, {
      redirect: "manual",
      headers: session ? { cookie: `sandbox_session=${session}` } : {},
    })
    const body = await response.text()
    const admin = path.startsWith("/en/admin")
    const review = path.includes("/moderation/permissions/")
    const managed = /^\/en\/apps\/manage\/[^/]+$/.test(path)
    const agreement = path === "/en/apps/new/register"
    const signedIn = ["valid", "admin", "moderator"].includes(session)
    const denied =
      !signedIn ||
      (admin && session === "valid") ||
      (review && session !== "moderator") ||
      managed ||
      (agreement && signedIn)
    assert.equal(response.status, denied ? 307 : 200, `${path} ${session}`)
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-store",
      path,
    )
    assert.equal(response.headers.get("x-start-cache"), "BYPASS", path)
    assert.equal(response.headers.has("surrogate-key"), false, path)
    if (denied) {
      const target = new URL(response.headers.get("location"), base)
      assert.equal(
        target.pathname,
        signedIn
          ? agreement
            ? "/en/apps/new/publisher-agreement"
            : "/en/unauthorized"
          : admin ||
              path === "/en/developer-portal" ||
              path === "/en/apps/new/register"
            ? "/en/login/developer"
            : "/en/login",
        path,
      )
      if (!signedIn) {
        assert.equal(target.searchParams.get("returnTo"), path.slice(3))
      }
      assert.ok(
        !body.includes('"layout":"admin"'),
        "Denied document must not serialize the admin page",
      )
      for (const marker of [
        "Sandbox developer update",
        "pk_test_sandbox",
        "org.example.Sandbox",
      ]) {
        assert.equal(
          body.includes(marker),
          false,
          "Denied pages must not serialize loader data",
        )
      }
    }
    results.push({
      path,
      session: session || "anonymous",
      status: response.status,
      cache: response.headers.get("cache-control"),
    })
  }
}

const edgeResults = []
if (values["edge-base"]) {
  for (const path of [
    "/en/settings",
    "/en/admin/users",
    "/en/purchase/checkout",
    "/en/developer-portal",
    "/en/payment/123",
    "/en/admin/moderation/permissions/123",
  ]) {
    for (const session of [null, "valid", "admin", "moderator"]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(values["edge-base"] + path, {
          redirect: "manual",
          headers: session ? { cookie: `sandbox_session=${session}` } : {},
        })
        await response.text()
        assert.equal(
          response.status,
          !session ||
            (path.includes("/admin/") && session === "valid") ||
            (path.includes("/moderation/permissions/") &&
              session !== "moderator")
            ? 307
            : 200,
          path,
        )
        assert.equal(response.headers.get("x-edge-cache"), "BYPASS", path)
        assert.equal(
          response.headers.get("cache-control"),
          "private, no-store",
          path,
        )
        assert.equal(response.headers.has("surrogate-key"), false, path)
        edgeResults.push({
          path,
          session: session || "anonymous",
          attempt,
          state: "BYPASS",
        })
      }
    }
  }
}
const proxy = await createCspProxy(origin)
base = proxy.base
const browser = await chromium.launch()
const journeys = []
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
      serviceWorkers: "block",
    })
    await context.addInitScript((theme) => {
      if (location.protocol === "http:") {
        localStorage.setItem("theme", theme)
      }
    }, variant.colorScheme)
    await context.addInitScript(installStripeFixture)
    const errors = []
    const transports = []
    const forbiddenRequests = []
    const reviewRequests = []
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
      } catch {
        return route.abort()
      }
    })
    const page = await context.newPage()
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (
        url.hostname.endsWith("stripe.com") ||
        (url.port === "4101" &&
          request.method() !== "GET" &&
          request.method() !== "OPTIONS" &&
          !url.pathname.includes("envelope"))
      ) {
        forbiddenRequests.push(request.url())
      }
      if (url.pathname.startsWith("/moderation/permission-reviews")) {
        reviewRequests.push(url.pathname)
      }
    })
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
      if (response.url().includes("/_serverFn/")) {
        transports.push({
          url: response.url(),
          cache: response.headers()["cache-control"],
        })
      }
    })
    const visit = async (path) => {
      await page.goto("about:blank")
      await page.goto(base + path, { waitUntil: "domcontentloaded" })
    }
    await visit("/zh-Hans/admin/users?filterString=test")
    assert.equal(new URL(page.url()).pathname, "/zh-Hans/login/developer")
    assert.equal(
      new URL(page.url()).searchParams.get("returnTo"),
      "/admin/users?filterString=test",
    )
    await context.addCookies([
      { name: "sandbox_session", value: "valid", url: base },
    ])
    await visit("/en/settings")
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor()
    await visit("/en/admin/users")
    assert.equal(new URL(page.url()).pathname, "/en/unauthorized")
    await context.addCookies([
      { name: "sandbox_session", value: "admin", url: base },
    ])
    await visit("/en/admin/users")
    await page.getByRole("heading", { name: "Users", exact: true }).waitFor()
    await page.getByPlaceholder("Search", { exact: true }).waitFor()
    await context.addCookies([
      { name: "sandbox_session", value: "valid", url: base },
    ])
    await page
      .getByPlaceholder("Search", { exact: true })
      .fill("permission-revoked")
    await page.getByPlaceholder("Search", { exact: true }).press("Tab")
    try {
      await page.waitForURL("**/en/unauthorized", { timeout: 10000 })
    } catch (error) {
      console.log(
        JSON.stringify({
          variant: variant.name,
          url: page.url(),
          transports,
          errors,
        }),
      )
      throw error
    }
    await page
      .getByRole("heading", { name: "Users", exact: true })
      .waitFor({ state: "hidden" })
    await visit("/en/developer-portal")
    await page
      .getByRole("heading", { name: "Developer Portal", exact: true })
      .waitFor()
    await page
      .getByRole("link", { name: "Sandbox developer update", exact: true })
      .waitFor()
    await page.screenshot({
      path: resolve(values.output, `${variant.name}-developer-portal.png`),
      animations: "disabled",
    })

    await context.addCookies([
      { name: "sandbox_session", value: "admin", url: base },
    ])
    const beforeDeniedReview = reviewRequests.length
    await visit("/en/admin/moderation/permissions/123")
    assert.equal(new URL(page.url()).pathname, "/en/unauthorized")
    assert.equal(
      reviewRequests.length,
      beforeDeniedReview,
      "A non-moderator admin must not fetch the assessment",
    )
    await context.addCookies([
      { name: "sandbox_session", value: "moderator", url: base },
    ])
    await visit("/en/admin/moderation/permissions/123")
    await page
      .getByRole("heading", { name: "org.example.Sandbox", exact: true })
      .waitFor()
    const reject = page.getByRole("button", { name: "Reject", exact: true })
    assert.equal(await reject.isDisabled(), true)
    await page
      .getByLabel("Decision rationale", { exact: true })
      .fill("Synthetic permission review rationale")
    assert.equal(await reject.isEnabled(), true)
    assert.ok(reviewRequests.includes("/moderation/permission-reviews/123"))
    await page.screenshot({
      path: resolve(values.output, `${variant.name}-permission-review.png`),
      animations: "disabled",
    })

    await context.addCookies([
      { name: "sandbox_session", value: "valid", url: base },
    ])
    await visit("/en/payment/123")
    const terms = page.locator("#purchase-terms-confirm")
    await terms.waitFor()
    const next = page.getByRole("button", { name: "Continue", exact: true })
    assert.equal(await next.isDisabled(), true)
    await terms.click()
    assert.equal(await next.isEnabled(), true)
    const stripeCalls = await page.evaluate(() => window.__sandboxStripeCalls)
    assert.ok(
      stripeCalls.some(
        (call) =>
          call.method === "elements" &&
          call.options.clientSecret === "pi_sandbox_secret_fixture" &&
          call.options.appearance.theme ===
            (variant.colorScheme === "dark" ? "night" : "stripe"),
      ),
    )
    assert.deepEqual(
      forbiddenRequests,
      [],
      "No live Stripe traffic or state-changing API request is permitted",
    )
    await page.screenshot({
      path: resolve(values.output, `${variant.name}-payment-entry.png`),
      animations: "disabled",
    })
    assert.ok(transports.length, "Navigation must exercise a server function")
    assert.ok(
      transports.every((transport) => transport.cache === "private, no-store"),
      "Server-function responses must bypass shared caches",
    )
    assert.deepEqual(errors, [], variant.name)
    journeys.push({
      variant: variant.name,
      anonymousRedirect: "passed",
      authenticatedSettings: "passed",
      ordinaryAdminDenied: "passed",
      adminUsers: "passed",
      revokedSessionNavigation: "passed",
      developerPortalFeed: "passed",
      nonModeratorDenied: "passed",
      permissionReviewRendering: "passed",
      paymentTermsRendering: "passed",
      livePaymentRequests: forbiddenRequests.length,
      transports,
    })
    await context.close()
  }
} finally {
  await browser.close()
  await proxy.close()
  await writeFile(
    resolve(values.output, "protected.json"),
    JSON.stringify({ results, edgeResults, journeys }, null, 2),
  )
}
console.log(
  `${results.length} protected document cases, ${edgeResults.length} edge bypass checks and ${journeys.length} browser authorization suites passed`,
)
