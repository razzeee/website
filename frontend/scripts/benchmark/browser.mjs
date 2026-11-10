import { chromium } from "playwright"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { gzipSync } from "node:zlib"

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:3000" },
    output: { type: "string" },
    assets: { type: "string" },
    record: { type: "boolean", default: false },
    label: { type: "string" },
    path: { type: "string", multiple: true },
  },
})
if (!values.output || !values.assets || !values.label) {
  throw new Error("Provide --output, --assets and --label")
}
await mkdir(values.output, { recursive: true })
await mkdir(values.assets, { recursive: true })
const browser = await chromium.launch()
const reports = []
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
    deviceScaleFactor: 1,
  },
  {
    name: "mobile-dark",
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
    isMobile: true,
    deviceScaleFactor: 1,
  },
]
const paths = values.path || [
  "/en",
  "/en/apps/org.mozilla.firefox",
  "/en/apps/category/graphics/1",
  "/en/about",
]
try {
  for (const variant of variants) {
    const context = await browser.newContext({
      ...variant,
      reducedMotion: "reduce",
      serviceWorkers: "block",
      bypassCSP: true,
    })
    const errors = []
    const assets = []
    let closing = false
    await context.addInitScript(
      (theme) => localStorage.setItem("theme", theme),
      variant.colorScheme,
    )
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url())
      const cors = {
        "access-control-allow-origin": new URL(values["base-url"]).origin,
        "access-control-allow-credentials": "true",
      }
      try {
        if (route.request().headers()["next-router-prefetch"]) {
          return await route.fulfill({ status: 204, body: "" })
        }
        if (
          url.hostname === "webstats.gnome.org" ||
          url.hostname.includes("sentry.io")
        ) {
          return await route.fulfill({
            status: 200,
            body: "",
            contentType: "application/javascript",
          })
        }
        if (url.pathname.endsWith("/auth/userinfo")) {
          return await route.fulfill({
            status: 401,
            json: { detail: "Not authenticated" },
            headers: cors,
          })
        }
        if (url.port === "4101") {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(30000),
          })
          return await route.fulfill({
            status: response.status,
            body: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get("content-type"),
            headers: cors,
          })
        }
        let file
        if (
          url.hostname === "dl.flathub.org" &&
          url.pathname.startsWith("/assets/_next/static/")
        ) {
          file = resolve(
            ".next/static",
            url.pathname.slice("/assets/_next/static/".length),
          )
        } else if (
          url.hostname === "dl.flathub.org" &&
          url.pathname.startsWith("/assets/_next/public/")
        ) {
          file = resolve(
            "public",
            url.pathname.slice("/assets/_next/public/".length),
          )
        }
        if (file) {
          return await route.fulfill({
            path: file,
            headers: { "access-control-allow-origin": "*" },
          })
        }
        if (["127.0.0.1", "localhost"].includes(url.hostname)) {
          return await route.continue()
        }
        const filename = resolve(
          values.assets,
          createHash("sha256").update(url.href).digest("hex") + ".json",
        )
        let saved
        try {
          saved = JSON.parse(await readFile(filename, "utf8"))
        } catch (error) {
          if (error.code !== "ENOENT" || !values.record) {
            throw error
          }
          const response = await fetch(url, {
            signal: AbortSignal.timeout(30000),
          })
          if (!response.ok) {
            throw new Error(`Asset ${response.status}: ${url}`)
          }
          saved = {
            url: url.href,
            contentType: response.headers.get("content-type"),
            body: Buffer.from(await response.arrayBuffer()).toString("base64"),
          }
          await writeFile(filename, JSON.stringify(saved))
        }
        assets.push(url.href)
        return await route.fulfill({
          status: 200,
          contentType: saved.contentType,
          body: Buffer.from(saved.body, "base64"),
          headers: { "access-control-allow-origin": "*" },
        })
      } catch (error) {
        if (closing) {
          return
        }
        errors.push(`Network: ${url.href}: ${error.message}`)
        await route.abort()
      }
    })
    const page = await context.newPage()
    let scriptTasks = []
    page.on("response", (response) => {
      if (
        response.request().resourceType() === "script" &&
        response.ok() &&
        !response.url().includes("webstats.gnome.org")
      ) {
        scriptTasks.push(
          response
            .body()
            .then((body) => ({
              url: response.url(),
              bytes: body.length,
              gzipBytes: gzipSync(body).length,
            }))
            .catch((error) => ({ url: response.url(), error: error.message })),
        )
      }
    })
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("response", (response) => {
      const expectedAnonymous =
        response.status() === 401 ||
        (response.status() === 400 &&
          response.url().endsWith("/vendingapp/org.mozilla.firefox/setup"))
      if (response.status() >= 400 && !expectedAnonymous) {
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
    for (const [index, path] of paths.entries()) {
      scriptTasks = []
      const before = errors.length
      const response = await page.goto(values["base-url"] + path, {
        waitUntil: "networkidle",
      })
      await page.locator("main").waitFor()
      if (path === "/en") {
        await page.waitForFunction(() => {
          const buttons = [...document.querySelectorAll("main button")]
          return buttons.some(
            (button) =>
              button.textContent.includes("Next slide") &&
              !button.disabled &&
              Object.keys(button).some((key) =>
                key.startsWith("__reactProps$"),
              ),
          )
        })
      }
      const heading =
        path === "/en"
          ? "Productivity"
          : path.includes("firefox")
            ? "Firefox"
            : path.includes("category")
              ? "Graphics & Photography"
              : "About Flathub: The Linux App Store"
      if (values.path) {
        await page.locator("main h1, main h2").first().waitFor()
      } else {
        await page
          .getByRole("heading", { name: heading, exact: true })
          .first()
          .waitFor()
      }
      await page.evaluate(() => document.fonts.ready)
      await page.waitForFunction(() =>
        [...document.images]
          .filter((image) => {
            const rect = image.getBoundingClientRect()
            return rect.top < innerHeight && rect.bottom > 0
          })
          .every((image) => image.complete),
      )
      const data = await page.evaluate(() => ({
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        description: document.querySelector('meta[name="description"]')
          ?.content,
        robots: document.querySelector('meta[name="robots"]')?.content,
        headings: [...document.querySelectorAll("main h1,main h2,main h3")].map(
          (node) => node.textContent,
        ),
        text: document.querySelector("main").innerText,
        links: [...document.querySelectorAll("main a")].map((node) => ({
          text: node.textContent,
          href: node.getAttribute("href"),
        })),
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        theme: document.documentElement.className,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        font: getComputedStyle(document.body).fontFamily,
        brokenImages: [...document.images]
          .filter((image) => image.complete && !image.naturalWidth)
          .map((image) => image.currentSrc),
        resources: performance.getEntriesByType("resource").map((r) => ({
          name: r.name,
          type: r.initiatorType,
          bytes: r.decodedBodySize,
        })),
        navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
      }))
      await page.screenshot({
        path: resolve(
          values.output,
          `${values.label}-${variant.name}-${index}.png`,
        ),
        fullPage: false,
        animations: "disabled",
      })
      const scripts = await Promise.all(scriptTasks)
      reports.push({
        path,
        variant: variant.name,
        status: response.status(),
        errors: errors.slice(before),
        scripts,
        ...data,
      })
    }
    // Exercise a real client-side link, rather than only direct document loads.
    await page.goto(values["base-url"] + "/en", { waitUntil: "networkidle" })
    const target = page.locator('a[href="/en/apps/category/graphics"]').first()
    await target.click()
    await page.waitForURL("**/en/apps/category/graphics/1")
    await page.locator("main").waitFor()
    reports.push({
      variant: variant.name,
      journey: "home-to-category",
      url: page.url(),
      errors: [...errors],
    })
    if (values.path) {
      await page.goto(values["base-url"] + "/zh-Hans/setup", {
        waitUntil: "networkidle",
      })
      await page.locator('main a[href="/zh-Hans/setup/Ubuntu"]').click()
      await page.waitForURL("**/zh-Hans/setup/Ubuntu")
      await page.locator("main h1").waitFor()
      reports.push({
        variant: variant.name,
        journey: "localized-setup",
        url: page.url(),
        errors: [...errors],
      })
    }
    closing = true
    await context.close()
  }
} finally {
  await browser.close()
  await writeFile(
    resolve(values.output, `${values.label}-browser.json`),
    JSON.stringify(
      {
        scope:
          "Browser parity diagnostic; request interception disables browser cache; anonymous auth and analytics stubbed equally. CSP bypassed for local fixture origin; Next speculative prefetch disabled. Neither production security nor prefetch parity is established.",
        reports,
      },
      null,
      2,
    ),
  )
}
if (
  reports.some(
    (row) =>
      row.status >= 400 || row.errors.some((error) => !error.includes("401")),
  )
) {
  process.exitCode = 1
}
