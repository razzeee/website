import { spawn, execFileSync } from "node:child_process"
import { once } from "node:events"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { createSandbox } from "./sandbox.mjs"

const { values } = parseArgs({
  options: {
    directory: { type: "string" },
    output: { type: "string" },
    samples: { type: "string", default: "30" },
    prime: { type: "boolean", default: false },
    arms: { type: "string", default: "next" },
  },
})
const samples = Number(values.samples)
const arms = values.arms.split(",")
if (arms.some((arm) => !["next", "start"].includes(arm))) {
  throw new Error("Unknown arm")
}
if (
  !values.directory ||
  !values.output ||
  !Number.isInteger(samples) ||
  samples < 1
) {
  throw new Error("Provide --directory, --output and positive --samples")
}
await mkdir(values.output, { recursive: true })
const container = `flathub-cache-benchmark-${process.pid}`
const image =
  "docker.io/library/redis@sha256:ec1c2d3603c3d7d65b153bedda0248b641aa3bd7684503406b27b9e870ac0796"
const podman = (...args) =>
  execFileSync("podman", args, { encoding: "utf8" }).trim()
const fixtures = createSandbox(values.directory)
const routes = [
  "/en",
  "/en/apps/org.mozilla.firefox",
  "/en/apps/category/graphics/1",
]
const rows = []
let child
let created = false
let logs = ""
let seed = 20261109
function random() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) / 4294967296
}
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit")
    child.kill("SIGTERM")
    const timeout = setTimeout(() => child?.kill("SIGKILL"), 10000)
    try {
      await exited
    } finally {
      clearTimeout(timeout)
    }
  }
  child = undefined
}
try {
  podman(
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--publish",
    "127.0.0.1::6379",
    image,
    "redis-server",
    "--save",
    "",
    "--appendonly",
    "no",
    "--notify-keyspace-events",
    "Exe",
  )
  created = true
  const port = podman("port", container, "6379/tcp").split(":").at(-1)
  await new Promise((ready, reject) => {
    fixtures.once("error", reject)
    fixtures.listen(4101, "127.0.0.1", ready)
  })
  for (let block = 0; block < samples; block++) {
    for (let index = 0; index < routes.length; index++) {
      const path = routes[(index + block) % routes.length]
      const order = random() < 0.5 ? arms : [...arms].reverse()
      for (const arm of order) {
        await stop()
        // This container is created by this run; no shared cache is touched.
        podman("exec", container, "redis-cli", "FLUSHDB")
        child = spawn(
          process.execPath,
          arm === "next"
            ? [".next/standalone/server.js"]
            : [
                "--import",
                "./experiments/start/instrument.server.mjs",
                "experiments/start/.output/server/index.mjs",
              ],
          {
            env: {
              ...process.env,
              NODE_ENV: "production",
              HOSTNAME: "127.0.0.1",
              HOST: "127.0.0.1",
              PORT: "3002",
              REDIS_URL: `redis://127.0.0.1:${port}`,
              API_BASE_URI: "http://127.0.0.1:4101",
              SENTRY_DSN: "http://public@127.0.0.1:4101/1",
              NODE_OPTIONS: "--max-old-space-size=2048",
              NEXT_TELEMETRY_DISABLED: "1",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        )
        await new Promise((ready, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Server startup timeout")),
            30000,
          )
          child.once("error", (error) => {
            clearTimeout(timeout)
            reject(error)
          })
          child.once("exit", (code) => {
            clearTimeout(timeout)
            reject(new Error(`Server exit ${code}`))
          })
          child.stdout.on("data", (chunk) => {
            logs += chunk
            if (/Ready|Listening on/.test(chunk.toString())) {
              clearTimeout(timeout)
              ready()
            }
          })
          child.stderr.on("data", (chunk) => {
            logs += chunk
          })
        })
        if (values.prime) {
          const priming = await fetch("http://127.0.0.1:3002/en/about", {
            signal: AbortSignal.timeout(30000),
          })
          await priming.arrayBuffer()
          if (!priming.ok) {
            throw new Error(`${arm} priming failed`)
          }
        }
        for (const regime of [
          values.prime
            ? "primed-process-cold-route"
            : "fresh-process-empty-redis",
          "immediate-repeat",
        ]) {
          const before = await (
            await fetch("http://127.0.0.1:4101/__fixtures/stats")
          ).json()
          const start = performance.now()
          const response = await fetch(`http://127.0.0.1:3002${path}`, {
            signal: AbortSignal.timeout(30000),
          })
          const headersMs = performance.now() - start
          const body = await response.text()
          const completeMs = performance.now() - start
          const after = await (
            await fetch("http://127.0.0.1:4101/__fixtures/stats")
          ).json()
          rows.push({
            arm,
            block,
            path,
            regime,
            status: response.status,
            cache: response.headers.get(
              arm === "next" ? "x-nextjs-cache" : "x-start-cache",
            ),
            headersMs,
            completeMs,
            bytes: Buffer.byteLength(body),
            apiRequests: after.requests - before.requests,
            valid:
              response.status === 200 &&
              body.includes(path.includes("firefox") ? "Firefox" : "Flathub") &&
              !after.errors.length &&
              response.headers.get(
                arm === "next" ? "x-nextjs-cache" : "x-start-cache",
              ) === (regime === "immediate-repeat" ? "HIT" : "MISS") &&
              (regime !== "immediate-repeat" ||
                after.requests === before.requests),
          })
        }
      }
    }
  }
  const stats = await (
    await fetch("http://127.0.0.1:4101/__fixtures/stats")
  ).json()
  await writeFile(
    resolve(values.output, "cache.json"),
    JSON.stringify(
      {
        scope:
          "Next and Start output cache MISS/HIT, both with Sentry initialized and local Redis/API replay. Hard-expiry and deployment semantics still require separate validation.",
        prime: values.prime,
        initialSeed: 20261109,
        image,
        node: process.version,
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        fixtures: stats,
        rows,
      },
      null,
      2,
    ),
  )
  if (rows.some((row) => !row.valid) || stats.errors.length) {
    process.exitCode = 1
  }
  console.log(
    `${rows.length} samples, ${rows.filter((row) => !row.valid).length} failed`,
  )
} finally {
  await stop()
  await new Promise((done) => fixtures.close(done))
  if (created) {
    podman("stop", container)
  }
  await writeFile(resolve(values.output, "cache-server.log"), logs)
}
