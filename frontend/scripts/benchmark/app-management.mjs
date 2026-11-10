import assert from "node:assert/strict"
import { chromium } from "playwright"
import { parseArgs } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { createCspProxy } from "./csp-proxy.mjs"
import { managedApp } from "./protected-fixtures.mjs"

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
const app = managedApp.id
const paths = [
  "/apps/new",
  "/apps/new/publisher-agreement",
  "/apps/new/register",
  `/apps/manage/${app}`,
  `/apps/manage/${app}/accept-invite`,
  `/apps/manage/${app}/accept-invite/publisher-agreement`,
]
const documents = [],
  edge = [],
  journeys = []
for (const server of [origin, values["edge-base"]].filter(Boolean)) {
  for (const path of paths) {
    for (const session of [
      null,
      "valid",
      "publisher",
      "owner",
      "invited",
      "invited-publisher",
    ]) {
      const accepted = ["publisher", "owner", "invited-publisher"].includes(
        session,
      )
      const expectedRedirect = !session
        ? `/en/login${path === "/apps/new/register" ? "/developer" : ""}?returnTo=${encodeURIComponent(path)}`
        : path === "/apps/new/register" && !accepted
          ? "/en/apps/new/publisher-agreement"
          : path === `/apps/manage/${app}` && session !== "owner"
            ? "/en/unauthorized"
            : path === `/apps/manage/${app}/accept-invite` &&
                session === "owner"
              ? `/en/apps/manage/${app}`
              : null
      const response = await fetch(server + "/en" + path, {
        redirect: "manual",
        headers: session ? { cookie: `sandbox_session=${session}` } : {},
      })
      await response.text()
      assert.equal(
        response.status,
        expectedRedirect ? 307 : 200,
        `${path} ${session}`,
      )
      if (expectedRedirect) {
        const target = new URL(response.headers.get("location"), server)
        assert.equal(
          target.pathname + target.search,
          expectedRedirect,
          `${path} ${session}`,
        )
      }
      assert.equal(response.headers.get("cache-control"), "private, no-store")
      assert.equal(response.headers.has("surrogate-key"), false)
      if (server !== origin) {
        assert.equal(response.headers.get("x-edge-cache"), "BYPASS")
      }
      const row = {
        path,
        session: session || "anonymous",
        status: response.status,
        destination: expectedRedirect,
        cache: "private, no-store",
      }
      ;(server === origin ? documents : edge).push(row)
    }
  }
}

const proxy = await createCspProxy(origin)
const base = proxy.base
const browser = await chromium.launch()
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
    assert.equal(
      (
        await fetch("http://127.0.0.1:4101/__sandbox/reset-apps", {
          method: "POST",
        })
      ).status,
      200,
    )
    const context = await browser.newContext({
      ...variant,
      serviceWorkers: "block",
    })
    await context.addInitScript((theme) => {
      if (location.protocol === "http:") {
        localStorage.setItem("theme", theme)
      }
    }, variant.colorScheme)
    const errors = [],
      writes = []
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (url.hostname === "webstats.gnome.org") {
        return route.fulfill({ status: 200, body: "" })
      }
      if (url.hostname === "127.0.0.1") {
        if (url.port === "4101") {
          if (
            !["GET", "OPTIONS"].includes(request.method()) &&
            !url.pathname.includes("envelope")
          ) {
            assert.ok(
              [
                "/auth/accept-publisher-agreement",
                `/invites/${app}/accept`,
              ].includes(url.pathname),
              `Unexpected mutation: ${url.pathname}`,
            )
            writes.push(url.pathname)
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
    const session = (value) =>
      context.addCookies([{ name: "sandbox_session", value, url: base }])

    await visit(`/zh-Hans/apps/manage/${app}`)
    assert.equal(new URL(page.url()).pathname, "/zh-Hans/login")
    await session("valid")
    await visit(`/en/apps/manage/${app}`)
    assert.equal(new URL(page.url()).pathname, "/en/unauthorized")
    await visit(`/en/apps/manage/${app}/accept-invite`)
    await page
      .getByRole("heading", { name: "Invite not found", exact: true })
      .waitFor()
    assert.equal(
      await page.getByRole("button", { name: "Accept", exact: true }).count(),
      0,
    )

    await visit("/en/apps/new")
    await page.getByRole("heading", { name: "New app", exact: true }).waitFor()
    await page.locator('main a[href="/en/apps/new/register"]').click()
    await page.waitForURL("**/en/apps/new/publisher-agreement")
    await page
      .getByRole("heading", {
        name: "Publisher Submission Agreement",
        exact: true,
      })
      .waitFor()
    const next = page.getByRole("button", { name: "Continue", exact: true })
    assert.equal(await next.isDisabled(), true)
    await page.locator("#agree").click()
    assert.equal(await next.isEnabled(), true)
    await page.screenshot({
      path: resolve(values.output, `${variant.name}-new-app-agreement.png`),
      animations: "disabled",
    })
    await next.click()
    await page.waitForURL("**/en/apps/new/register")
    await page.getByPlaceholder("App ID", { exact: true }).waitFor()
    const verify = page.getByRole("button", {
      name: "Verify App ID",
      exact: true,
    })
    assert.equal(await verify.isDisabled(), true)
    await page
      .getByPlaceholder("App ID", { exact: true })
      .fill("org.example.NewSandbox")
    assert.equal(await verify.isEnabled(), true)
    await page.screenshot({
      path: resolve(values.output, `${variant.name}-new-app-register.png`),
      animations: "disabled",
    })

    await session("invited")
    await visit(`/en/apps/manage/${app}/accept-invite`)
    await page.getByRole("button", { name: "Accept", exact: true }).waitFor()
    await page.getByRole("button", { name: "Accept", exact: true }).click()
    await page.waitForURL("**/accept-invite/publisher-agreement")
    const accept = page.getByRole("button", {
      name: "Accept Invite",
      exact: true,
    })
    assert.equal(await accept.isDisabled(), true)
    await page.locator("#agree").click()
    await accept.click()
    await page.waitForURL(`**/en/apps/manage/${app}`)
    await page
      .getByRole("heading", { name: "Sandbox Managed App", exact: true })
      .waitFor()
    if (variant.name.startsWith("desktop")) {
      await page.getByRole("tab", { name: "Maintenance", exact: true }).click()
    } else {
      await page.locator("#management-section").click()
      await page
        .getByRole("option", { name: "Maintenance", exact: true })
        .click()
    }
    await page
      .getByText("org.example.Platform/x86_64/1", { exact: true })
      .waitFor()
    await page.screenshot({
      path: resolve(values.output, `${variant.name}-app-management.png`),
      animations: "disabled",
    })
    await visit(`/en/apps/manage/${app}/accept-invite`)
    assert.equal(new URL(page.url()).pathname, `/en/apps/manage/${app}`)
    await page
      .getByRole("heading", { name: "Sandbox Managed App", exact: true })
      .waitFor()
    assert.deepEqual(writes, [
      "/auth/accept-publisher-agreement",
      "/auth/accept-publisher-agreement",
      `/invites/${app}/accept`,
    ])
    assert.deepEqual(errors, [], variant.name)
    journeys.push({
      variant: variant.name,
      anonymousRedirect: "passed",
      nonOwnerDenied: "passed",
      missingInvitationDenied: "passed",
      publisherAgreement: "passed",
      registrationRendering: "passed",
      invitationAgreement: "passed",
      invitationAccepted: "passed",
      ownerManagement: "passed",
      alreadyOwnerRedirect: "passed",
      writes,
    })
    await context.close()
  }
} finally {
  await browser.close()
  await proxy.close()
  await writeFile(
    resolve(values.output, "app-management.json"),
    JSON.stringify({ documents, edge, journeys }, null, 2),
  )
}
console.log(
  `${documents.length} app-management document cases, ${edge.length} edge bypass checks and ${journeys.length} browser workflow suites passed`,
)
