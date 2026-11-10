import assert from "node:assert/strict"
import { chromium } from "playwright"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { parseArgs } from "node:util"
import { createCspProxy } from "./csp-proxy.mjs"

const { values } = parseArgs({
  options: {
    output: { type: "string" },
    assets: { type: "string" },
    "next-upstream": { type: "string" },
    "start-upstream": { type: "string" },
  },
})
if (!values.output || !values.assets) {
  throw new Error("Provide --output and --assets")
}
await mkdir(values.output, { recursive: true })
const browser = await chromium.launch()
const results = []
const proxies = []
let currentPage, currentErrors
const variants = [
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
]
try {
  for (const [arm, port] of [
    ["next", 3000],
    ["start", 3001],
  ]) {
    const upstream = values[`${arm}-upstream`]
    if (upstream) {
      proxies.push(await createCspProxy(upstream, { port }))
    }
    const base = `http://127.0.0.1:${port}`
    for (const variant of variants) {
      const context = await browser.newContext({
        ...variant,
        serviceWorkers: "block",
      })
      const errors = []
      currentErrors = errors
      const requests = []
      await context.addInitScript((theme) => {
        if (location.protocol === "http:") {
          localStorage.setItem("theme", theme)
        }
      }, variant.colorScheme)
      await context.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url())
        if (request.headers()["next-router-prefetch"]) {
          return route.fulfill({ status: 204 })
        }
        if (url.hostname === "webstats.gnome.org") {
          return route.fulfill({ status: 200, body: "" })
        }
        if (
          url.hostname === "dl.flathub.org" &&
          url.pathname.startsWith("/assets/_next/")
        ) {
          const suffix = url.pathname.slice("/assets/_next/".length)
          return route.fulfill({
            path: resolve(suffix.startsWith("static/") ? ".next" : ".", suffix),
          })
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
          const file = resolve(
            values.assets,
            createHash("sha256").update(url.href).digest("hex") + ".json",
          )
          const saved = JSON.parse(await readFile(file, "utf8"))
          return route.fulfill({
            status: 200,
            contentType: saved.contentType,
            body: Buffer.from(saved.body, "base64"),
          })
        } catch {
          return route.abort()
        }
      })
      const page = await context.newPage()
      currentPage = page
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("response", (response) => {
        if (
          response.status() >= 400 &&
          !response.url().includes("/auth/email/confirm")
        ) {
          errors.push(`HTTP ${response.status()} ${response.url()}`)
        }
      })
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !message.text().startsWith("Failed to load resource:")
        ) {
          errors.push(message.text())
        }
      })
      page.on("request", (request) => {
        if (request.url().includes("/auth/") && request.method() === "POST") {
          requests.push({ url: request.url(), body: request.postDataJSON() })
        }
      })
      const visit = async (path) => {
        await page.goto("about:blank")
        const response = await page.goto(base + path, {
          waitUntil: "domcontentloaded",
        })
        assert.equal(response.status(), 200, `${arm} ${path}`)
        if (path.includes("/login/email/confirm")) {
          await page.waitForFunction(() =>
            [...document.querySelectorAll("main button")].some((button) =>
              Object.keys(button).some((key) =>
                key.startsWith("__reactProps$"),
              ),
            ),
          )
        }
        return response
      }
      await visit("/en/login/email?returnTo=%2Fen%2Fsettings")
      await page.waitForFunction(() =>
        Object.keys(document.querySelector("main #login-email") || {}).some(
          (key) => key.startsWith("__reactProps$"),
        ),
      )
      await page.locator("main #login-email").fill("sandbox@example.test")
      await page.locator('main button[type="submit"]').click()
      await page
        .getByRole("status")
        .filter({ hasText: /sign-in link is on its way/i })
        .waitFor()
      assert.deepEqual(
        requests.find((r) => r.url.endsWith("/auth/email/request"))?.body,
        {
          email: "sandbox@example.test",
          locale: "en",
          return_to: "/en/settings",
        },
      )

      for (const [token, expected] of [
        ["invalid", /invalid|expired/i],
        ["conflict", /different|already|another/i],
        ["limited", /too many|try again|wait/i],
      ]) {
        const response = await visit(`/en/login/email/confirm#token=${token}`)
        assert.match(response.headers()["cache-control"], /no-store/)
        assert.equal(response.headers()["referrer-policy"], "no-referrer")
        await page.waitForFunction(() => !location.hash)
        await page.getByRole("button", { name: "Sign in", exact: true }).click()
        await page
          .locator("main p")
          .filter({ hasText: expected })
          .first()
          .waitFor()
      }
      await visit("/en/login/email/confirm#token=valid")
      await page.waitForFunction(() => !location.hash)
      await page.getByRole("button", { name: "Sign in", exact: true }).click()
      await page.waitForURL("**/en/settings")
      await page
        .getByRole("heading", { name: "Settings", exact: true })
        .waitFor()
      assert.ok(
        (await context.cookies()).some(
          (cookie) => cookie.name === "sandbox_session" && cookie.httpOnly,
        ),
      )
      await page.screenshot({
        path: resolve(values.output, `${arm}-${variant.name}-settings.png`),
        animations: "disabled",
      })

      await context.clearCookies()
      await visit("/en/settings")
      assert.equal(
        await page
          .getByRole("heading", { name: "Settings", exact: true })
          .count(),
        0,
      )
      await context.addCookies([
        { name: "NEXT_LOCALE", value: "en", url: base },
      ])
      await visit("/en/login/github?code=valid&state=sandbox")
      await page.waitForURL(base + "/en")
      assert.ok(
        requests.some(
          (r) =>
            r.url.endsWith("/auth/login/github") &&
            r.body.code === "valid" &&
            r.body.state === "sandbox",
        ),
      )
      assert.deepEqual(errors, [], `${arm} ${variant.name} browser errors`)
      const marker = `Sandbox telemetry check ${arm} ${variant.name}`
      const envelope = page.waitForResponse(
        (response) =>
          response.url().includes("/envelope/") &&
          response.request().postData()?.includes(marker),
        { timeout: 15000 },
      )
      await page.addScriptTag({
        content: `setTimeout(() => { throw new Error(${JSON.stringify(marker)}) }, 0)`,
      })
      assert.equal((await envelope).status(), 200)
      results.push({
        arm,
        variant: variant.name,
        passed: true,
        scenarios: [
          "email-request",
          "invalid-link",
          "session-conflict",
          "rate-limit",
          "email-confirm-session",
          "settings-authenticated",
          "settings-anonymous",
          "oauth-callback",
        ],
        telemetryCaptured: true,
        errors: errors.filter((error) => !error.includes(marker)),
      })
      await context.close()
    }
  }
} catch (error) {
  console.error(currentErrors)
  console.error(currentPage?.url())
  if (currentPage && !currentPage.isClosed()) {
    await writeFile(
      resolve(values.output, "failure.html"),
      await currentPage.content(),
    )
    await currentPage.screenshot({
      path: resolve(values.output, "failure.png"),
    })
  }
  throw error
} finally {
  await browser.close()
  await Promise.all(proxies.map((proxy) => proxy.close()))
  await writeFile(
    resolve(values.output, "auth-flows.json"),
    JSON.stringify(
      {
        scope:
          "Real frontend flows against synthetic local auth backend; CSP enforced with only sandbox connect origin added. Does not verify real OAuth provider, email delivery or WebAuthn ceremony.",
        results,
      },
      null,
      2,
    ),
  )
}
console.log(`${results.length} arm/variant auth suites passed`)
