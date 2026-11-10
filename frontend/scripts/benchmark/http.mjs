import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { arch, cpus, platform } from "node:os"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  options: {
    "base-url": { type: "string" },
    output: { type: "string" },
    routes: { type: "string" },
    samples: { type: "string", default: "30" },
    "fixture-url": { type: "string" },
    label: { type: "string" },
  },
})
const count = Number(values.samples)
if (
  !values["base-url"] ||
  !values.output ||
  !values.label ||
  !Number.isInteger(count) ||
  count < 1
) {
  throw new Error(
    "Provide --base-url, --output, --label and positive --samples",
  )
}
const routeText = await readFile(
  values.routes || new URL("./routes.json", import.meta.url),
  "utf8",
)
const routes = JSON.parse(routeText)
const results = []
for (let block = 0; block < count; block++) {
  // Rotate route order deterministically to distribute temporal effects.
  for (let index = 0; index < routes.length; index++) {
    const route = routes[(index + block) % routes.length]
    const start = performance.now()
    try {
      const response = await fetch(new URL(route.path, values["base-url"]), {
        redirect: "manual",
        headers: { "accept-encoding": "identity" },
        signal: AbortSignal.timeout(30000),
      })
      const headersMs = performance.now() - start
      const body = Buffer.from(await response.arrayBuffer())
      const completeMs = performance.now() - start
      const location = response.headers.get("location")
      const valid =
        response.status === route.status &&
        (!route.contains || body.toString().includes(route.contains)) &&
        (!route.location || location === route.location)
      results.push({
        block,
        path: route.path,
        valid,
        status: response.status,
        headersMs,
        completeMs,
        decodedBytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        headers: Object.fromEntries(
          [
            "content-type",
            "cache-control",
            "vary",
            "age",
            "x-nextjs-cache",
            "location",
          ].map((name) => [name, response.headers.get(name)]),
        ),
      })
    } catch (error) {
      results.push({
        block,
        path: route.path,
        valid: false,
        error: error.message,
      })
    }
  }
}
let fixtureStats = null
if (values["fixture-url"]) {
  const response = await fetch(
    new URL("/__fixtures/stats", values["fixture-url"]),
    {
      signal: AbortSignal.timeout(5000),
    },
  )
  if (!response.ok) {
    throw new Error("Cannot read fixture stats")
  }
  fixtureStats = await response.json()
}
const summary = routes.map(({ path }) => {
  const all = results.filter((row) => row.path === path)
  const successful = all.filter((row) => row.valid)
  const times = successful.map((row) => row.completeMs).sort((a, b) => a - b)
  const percentile = (p) =>
    times.length ? times[Math.ceil(p * times.length) - 1] : null
  return {
    path,
    samples: all.length,
    failures: all.length - successful.length,
    completeMsP50: percentile(0.5),
    completeMsP95: percentile(0.95),
  }
})
const report = {
  label: values.label,
  createdAt: new Date().toISOString(),
  scope:
    "Sequential HTTP diagnostic; cache state uncontrolled; no browser or load-test claims",
  baseUrl: values["base-url"],
  environment: {
    node: process.version,
    arch: arch(),
    platform: platform(),
    cpu: cpus()[0]?.model,
  },
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  workingTree: execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }),
  routesSha256: createHash("sha256").update(routeText).digest("hex"),
  lockfileSha256: createHash("sha256")
    .update(await readFile(new URL("../../pnpm-lock.yaml", import.meta.url)))
    .digest("hex"),
  fixtureStats,
  summary,
  results,
}
await writeFile(values.output, JSON.stringify(report, null, 2) + "\n")
console.table(summary)
if (
  results.some((row) => !row.valid) ||
  fixtureStats?.errors.length ||
  fixtureStats?.misses.length
) {
  process.exitCode = 1
}
