import { readFile, writeFile } from "node:fs/promises"
import { realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { directory: { type: "string" } } })
if (!values.directory) {
  throw new Error("Provide --directory")
}
const require = createRequire(realpathSync("node_modules/next/package.json"))
const sharp = require("sharp")
const load = async (name) =>
  JSON.parse(await readFile(resolve(values.directory, name), "utf8"))
const baseline = await load("next-browser.json")
const candidate = await load("start-browser.json")
const fields = [
  "status",
  "title",
  "canonical",
  "description",
  "robots",
  "headings",
  "text",
  "links",
  "lang",
  "dir",
  "font",
  "horizontalOverflow",
]
const comparisons = []
for (const variant of [
  "desktop-light",
  "desktop-dark",
  "mobile-light",
  "mobile-dark",
]) {
  const pages = baseline.reports.filter(
    (row) => row.variant === variant && row.path,
  )
  for (const [index, page] of pages.entries()) {
    const other = candidate.reports.find(
      (row) => row.variant === variant && row.path === page.path,
    )
    if (!other) {
      throw new Error(`Candidate page missing: ${page.path}`)
    }
    const normalize = (field, value) =>
      field === "canonical" && typeof value === "string"
        ? value.replace(/^http:\/\/127\.0\.0\.1:300[01]/, "")
        : value
    const mismatches = fields.filter(
      (field) =>
        JSON.stringify(normalize(field, page[field])) !==
        JSON.stringify(normalize(field, other[field])),
    )
    const images = await Promise.all(
      ["next", "start"].map((label) =>
        sharp(resolve(values.directory, `${label}-${variant}-${index}.png`))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
      ),
    )
    let pixelsDifferent = 0
    if (images[0].data.length !== images[1].data.length) {
      throw new Error("Screenshot dimensions differ")
    }
    for (let pixel = 0; pixel < images[0].data.length; pixel += 4) {
      if (
        [0, 1, 2].some(
          (channel) =>
            Math.abs(
              images[0].data[pixel + channel] - images[1].data[pixel + channel],
            ) > 16,
        )
      ) {
        pixelsDifferent++
      }
    }
    const payload = (row) => {
      if (
        !row.scripts?.length ||
        row.scripts.some(
          (script) => script.error || !Number.isFinite(script.gzipBytes),
        )
      ) {
        throw new Error(`Incomplete script capture: ${row.path} ${row.variant}`)
      }
      return [
        ...new Map(row.scripts.map((script) => [script.url, script])).values(),
      ].reduce((sum, script) => sum + script.gzipBytes, 0)
    }
    comparisons.push({
      path: page.path,
      variant,
      mismatches,
      baselineErrors: page.errors,
      candidateErrors: other.errors,
      baselineBrokenImages: page.brokenImages,
      candidateBrokenImages: other.brokenImages,
      scriptGzipBytes: { next: payload(page), start: payload(other) },
      pixelDifferenceFraction: pixelsDifferent / (images[0].data.length / 4),
    })
  }
}
const journeys = candidate.reports.filter((row) => row.journey)
const baselineJourneys = baseline.reports.filter((row) => row.journey)
const journeyTargets = {
  "home-to-category": "/en/apps/category/graphics/1",
  "localized-setup": "/zh-Hans/setup/Ubuntu",
}
const journeyKeys = (rows) =>
  rows.map((row) => `${row.variant}:${row.journey}`).sort()
const sameJourneys =
  JSON.stringify(journeyKeys(journeys)) ===
  JSON.stringify(journeyKeys(baselineJourneys))
const passed =
  comparisons.length === 16 &&
  comparisons.every(
    (row) =>
      !row.mismatches.length &&
      !row.baselineErrors.length &&
      !row.candidateErrors.length &&
      !row.baselineBrokenImages.length &&
      !row.candidateBrokenImages.length,
  ) &&
  journeys.length >= 4 &&
  ["desktop-light", "desktop-dark", "mobile-light", "mobile-dark"].every(
    (variant) =>
      journeys.some(
        (row) => row.variant === variant && row.journey === "home-to-category",
      ),
  ) &&
  new Set(journeyKeys(journeys)).size === journeys.length &&
  sameJourneys &&
  [...journeys, ...baselineJourneys].every(
    (row) =>
      !row.errors.length &&
      new URL(row.url).pathname === journeyTargets[row.journey],
  )
await writeFile(
  resolve(values.directory, "parity.json"),
  JSON.stringify(
    {
      scope:
        "Four public pages, four variants; anonymous sandbox. Pixel differences are descriptive, with a 16/255 channel threshold, not a calibrated visual acceptance test. Security/cache/auth/other routes are separate migration gates.",
      semanticParityPassed: passed,
      comparisons,
      journeys,
    },
    null,
    2,
  ),
)
console.table(
  comparisons.map((row) => ({
    path: row.path,
    variant: row.variant,
    mismatches: row.mismatches.join(","),
    pixelDifference: row.pixelDifferenceFraction.toFixed(4),
    nextGzip: row.scriptGzipBytes.next,
    startGzip: row.scriptGzipBytes.start,
  })),
)
if (!passed) {
  process.exitCode = 1
}
