// Start Storybook first, then run:
// node scripts/test-hero-carousel.mjs http://127.0.0.1:6006
import assert from "node:assert/strict"
import { chromium } from "playwright"

const browser = await chromium.launch({ headless: true })
const base = process.argv[2] ?? "http://127.0.0.1:6006"
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
const active = () => page.locator('[data-slot="carousel-item"]:not([inert])')
const button = (name) => page.getByRole("button", { name, exact: true })
const selected = async (name) => {
  await page.waitForFunction(
    (name) =>
      document
        .querySelector('[data-slot="carousel-item"]:not([inert])')
        ?.textContent.includes(name),
    name,
  )
}
const open = async (story, motion = "no-preference") => {
  await page.emulateMedia({ reducedMotion: motion })
  await page.goto(
    `${base}/iframe.html?id=components-application-herobanner-interactions--${story}&viewMode=story`,
  )
  await page.getByRole("region", { name: "Featured apps" }).waitFor()
  await button("Next slide").waitFor({
    state: story === "single-slide" ? "hidden" : "visible",
  })
}
// These waits span a real rotation interval, after user actions on real Embla
// slides. They verify visible/focus behavior, not the plugin's timer internals.
const stays = async () => {
  const text = await active().textContent()
  await page.waitForTimeout(5500)
  assert.equal(await active().textContent(), text)
}
try {
  await open("rotating")
  await button("Pause slideshow").click()
  await button("Resume slideshow").waitFor()
  await button("Next slide").click()
  await selected("Second app")
  // A drag/release must not override the deliberate pause.
  await page.mouse.move(700, 140)
  await page.mouse.down()
  await page.mouse.move(400, 140, { steps: 10 })
  await page.mouse.up()
  await page.mouse.move(1090, 650)
  await stays()
  const beforeResume = await active().textContent()
  await button("Resume slideshow").click()
  await page.mouse.move(1090, 650)
  await page.waitForFunction(
    (text) =>
      document.querySelector('[data-slot="carousel-item"]:not([inert])')
        ?.textContent !== text,
    beforeResume,
    { timeout: 8000 },
  )
  console.log("PASS pause, navigation, drag, hover exit, explicit resume")

  await open("rotating")
  await page.keyboard.press("Tab")
  await button("Resume slideshow").waitFor()
  await page.keyboard.press("Tab")
  assert.equal(await page.locator("a:focus").count(), 1)
  await page.keyboard.press("ArrowRight")
  await selected("Second app")
  assert.equal(await active().locator("a:focus").count(), 1)
  await page.keyboard.press("Tab")
  assert.equal(
    await button("Previous slide").evaluate(
      (el) => el === document.activeElement,
    ),
    true,
  )
  await stays()
  await page.locator("body").click({ position: { x: 1090, y: 650 } })
  await stays()
  console.log(
    "PASS keyboard focus, offscreen tab exclusion, sticky focus pause",
  )

  await open("manual")
  await selected("Second app")
  assert.equal(await page.locator("[data-rotation-control]").count(), 0)
  await button("Next slide").click()
  await selected("Third app")
  await stays()
  await open("controlled")
  await selected("Third app")
  await button("Show first app").click()
  await selected("First app")
  console.log("PASS autoplay=false, initial currentIndex and update to zero")

  await open("rotating")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.locator("[data-rotation-control]").waitFor({ state: "hidden" })
  await stays()
  await open("rotating", "reduce")
  assert.equal(await page.locator("[data-rotation-control]").count(), 0)
  await button("Next slide").click()
  await selected("Second app")
  await stays()
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await button("Resume slideshow").waitFor()
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.locator("[data-rotation-control]").waitFor({ state: "hidden" })
  await stays()
  console.log("PASS reduced motion at load and runtime preference changes")

  await open("rtl")
  assert.equal(await page.getByRole("region").getAttribute("dir"), "rtl")
  await button("Next slide").focus()
  await page.keyboard.press("ArrowLeft")
  await selected("Second app")
  await page.keyboard.press("ArrowRight")
  await selected("First app")
  await open("single-slide")
  assert.equal(await page.getByRole("button").count(), 0)
  assert.equal(await page.getByRole("link").count(), 1)
  console.log("PASS RTL keyboard navigation and single slide")
} finally {
  await browser.close()
}
