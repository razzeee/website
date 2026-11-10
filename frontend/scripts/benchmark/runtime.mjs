import assert from "node:assert/strict"
import { createServer } from "node:http"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { parseArgs } from "node:util"
import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createClient } from "redis"
import { languages } from "../../src/i18n/locales.mjs"

const { values } = parseArgs({
  options: {
    output: { type: "string" },
    image: { type: "string" },
    site: { type: "string" },
    "public-api": { type: "string" },
  },
})
assert.ok(
  values.output &&
    values.image &&
    values.site &&
    values["public-api"] &&
    process.env.REDIS_URL,
  "Provide --output, --image, --site, --public-api and REDIS_URL",
)
assert.ok(
  new URL(values.site).hostname.endsWith(".test"),
  "Use a reserved .test staging origin",
)
assert.ok(
  new URL(values["public-api"]).hostname.endsWith(".test"),
  "Use a reserved .test public API origin",
)
await mkdir(values.output, { recursive: true })
const fixtureMissesBefore = (
  await (await fetch("http://127.0.0.1:4101/__fixtures/stats")).json()
).misses.length
await writeFile(
  resolve(values.output, "purge-fixture.mjs"),
  await readFile(new URL("./purge-fixture.mjs", import.meta.url)),
)
const exec = promisify(execFile)
const container = "flathub-runtime-validation",
  release = "runtime-validation-release"
const origin = "http://127.0.0.1:3001",
  edgeBase = "http://127.0.0.1:3003"
const paths = languages.map((locale) => `/${locale}/apps/org.mozilla.firefox`)
const generationKey = (path) =>
  `start:${release}:generation:${createHash("sha256").update(path).digest("hex")}`
const redis = createClient({ url: process.env.REDIS_URL })
redis.on("error", () => {})
await redis.connect()
const results = [],
  purges = [],
  apiRequests = []
let revision = "A",
  failPurge = true,
  beforePurge,
  started = false
const get = async (base, path, options = {}) => {
  const response = await fetch(base + path, { redirect: "manual", ...options })
  return { response, body: await response.text() }
}
const gateway = createServer(async (request, response) => {
  try {
    apiRequests.push({ path: request.url, method: request.method })
    const upstream = await fetch(`http://127.0.0.1:4101${request.url}`, {
      headers: request.headers,
      redirect: "manual",
    })
    const body = await upstream.text()
    if (
      request.url.startsWith("/appstream/org.mozilla.firefox") &&
      upstream.ok
    ) {
      const app = JSON.parse(body)
      app.name = `Runtime canary revision ${revision}`
      response
        .writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        })
        .end(JSON.stringify(app))
    } else {
      response
        .writeHead(upstream.status, {
          "content-type":
            upstream.headers.get("content-type") || "application/json",
        })
        .end(body)
    }
  } catch {
    response.writeHead(502).end()
  }
})
const fastly = createServer(async (request, response) => {
  try {
    assert.equal(request.method, "POST")
    assert.equal(request.headers["fastly-key"], "fixture-token")
    assert.ok(request.url.startsWith("/service/fixture-service/purge/"))
    const generations = await redis.mGet(paths.map(generationKey))
    assert.ok(
      generations.every(
        (generation, index) => Number(generation) > Number(beforePurge[index]),
      ),
      "Every locale must invalidate at origin before the first edge purge",
    )
    const key = decodeURIComponent(request.url.split("/").at(-1))
    if (failPurge) {
      failPurge = false
      purges.push({ key, status: 503, allOriginGenerationsAdvanced: true })
      response.writeHead(503).end()
      return
    }
    const purged = await fetch(edgeBase, {
      method: "PURGE",
      headers: { "X-Purge-Key": key },
    })
    await purged.text()
    assert.equal(purged.status, 200)
    purges.push({ key, status: 200, allOriginGenerationsAdvanced: true })
    response.writeHead(200, { "content-type": "application/json" }).end("{}")
  } catch (error) {
    results.push({ failure: error.message })
    response.writeHead(500).end()
  }
})
const cli = async (paths, env = {}, cdn = true) => {
  const args = [
    "exec",
    "--env",
    "PURGE_FIXTURE_ORIGIN=http://127.0.0.1:4104",
    "--env",
    "FASTLY_SERVICE_ID=fixture-service",
    "--env",
    "FASTLY_API_TOKEN=fixture-token",
  ]
  for (const [key, value] of Object.entries(env)) {
    args.push("--env", `${key}=${value}`)
  }
  args.push(
    container,
    "node",
    "--import",
    "/fixtures/purge-fixture.mjs",
    "server/invalidate.mjs",
    ...(cdn ? ["--cdn"] : []),
    ...paths,
  )
  try {
    const result = await exec("podman", args)
    return { code: 0, output: result.stdout + result.stderr }
  } catch (error) {
    return { code: error.code, output: error.stdout + error.stderr }
  }
}
try {
  await Promise.all([
    new Promise((done) => gateway.listen(4105, "127.0.0.1", done)),
    new Promise((done) => fastly.listen(4104, "127.0.0.1", done)),
  ])
  await exec("podman", [
    "run",
    "--detach",
    "--name",
    container,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--network",
    "host",
    "--volume",
    `${resolve(values.output)}:/fixtures:ro,Z`,
    "--env",
    "HOST=127.0.0.1",
    "--env",
    "PORT=3001",
    "--env",
    `GITHUB_SHA=${release}`,
    "--env",
    `REDIS_URL=${process.env.REDIS_URL}`,
    "--env",
    "API_BASE_URI=http://127.0.0.1:4105",
    "--env",
    "NEXT_PUBLIC_SITE_BASE_URI=https://runtime-override.invalid",
    "--env",
    "NEXT_PUBLIC_API_BASE_URI=https://runtime-override.invalid/api",
    "--env",
    "SENTRY_DSN=http://public@127.0.0.1:4101/1",
    values.image,
  ])
  started = true
  const inspect = JSON.parse(
    (await exec("podman", ["inspect", container])).stdout,
  )[0]
  assert.equal(inspect.HostConfig.ReadonlyRootfs, true)
  assert.equal(inspect.Config.User, "node")
  const ready = await exec("podman", [
    "exec",
    container,
    "node",
    "--input-type=module",
    "-e",
    "for(let attempt=0;attempt<100;attempt++){try{const response=await fetch('http://127.0.0.1:3001/robots.txt');if(response.ok){console.log(await response.text());break}}catch{}if(attempt===99)throw new Error('Runtime not ready');await new Promise(resolve=>setTimeout(resolve,50))}",
  ])
  assert.ok(ready.stdout.includes(`Host: ${values.site}`))
  const wildcard = ready.stdout.split("User-Agent: *\n")[1].split("\n\n")[0]
  assert.match(wildcard, /Allow: \//)
  assert.doesNotMatch(wildcard, /Disallow: \//)
  results.push({
    check: "build-time site/production flag survive runtime public overrides",
    passed: true,
  })

  const files = await readdir("experiments/start/.output/public/build-assets")
  const scripts = await Promise.all(
    files
      .filter((file) => file.endsWith(".js"))
      .map((file) =>
        readFile(
          `experiments/start/.output/public/build-assets/${file}`,
          "utf8",
        ),
      ),
  )
  assert.ok(scripts.some((script) => script.includes(values["public-api"])))
  assert.ok(
    scripts.every(
      (script) =>
        !script.includes("http://127.0.0.1:4105") &&
        !script.includes("runtime-override.invalid"),
    ),
  )
  const asset = await get(
    origin,
    `/build-assets/${files.find((file) => file.endsWith(".js"))}`,
  )
  assert.equal(asset.response.status, 200)
  assert.match(
    asset.response.headers.get("cache-control"),
    /max-age=31536000.*immutable/,
  )
  results.push({
    check:
      "public API is baked into client assets; internal runtime API is not",
    passed: true,
  })

  for (const path of [paths[0], "/de/apps/org.mozilla.firefox"]) {
    await get(edgeBase, path, { method: "PURGE" })
    await redis.incr(generationKey(path))
    const first = await get(edgeBase, path)
    assert.equal(first.response.status, 200)
    assert.equal(first.response.headers.get("x-edge-cache"), "MISS")
    assert.ok(first.body.includes("Runtime canary revision A"))
    assert.ok(first.body.includes(`${values.site}${path}`))
    const hit = await get(edgeBase, path)
    assert.equal(hit.response.headers.get("x-edge-cache"), "HIT")
    assert.equal(hit.body, first.body)
  }
  assert.ok(
    apiRequests.some((request) =>
      request.path.startsWith("/appstream/org.mozilla.firefox"),
    ),
  )
  results.push({
    check:
      "runtime API_BASE_URI supplies canary data, canonical uses build-time site",
    passed: true,
  })

  beforePurge = await redis.mGet(paths.map(generationKey))
  const missing = await cli([paths[0]], { GITHUB_SHA: "" })
  assert.notEqual(missing.code, 0)
  assert.match(
    missing.output,
    /Provide REDIS_URL and the deployment's GITHUB_SHA/,
  )
  assert.deepEqual(await redis.mGet(paths.map(generationKey)), beforePurge)
  assert.equal(purges.length, 0)
  const credentials = await cli([paths[0]], { FASTLY_API_TOKEN: "" })
  assert.notEqual(credentials.code, 0)
  assert.match(credentials.output, /CDN invalidation requires/)
  assert.equal(purges.length, 0)
  results.push({
    check:
      "packaged CLI refuses missing release and CDN credentials without changes",
    passed: true,
  })

  revision = "B"
  const failed = await cli([paths[0]])
  assert.notEqual(failed.code, 0)
  assert.match(failed.output, /CDN purge failed \(503\)/)
  assert.equal(purges.length, 1)
  const stale = await get(edgeBase, paths[0])
  assert.equal(stale.response.headers.get("x-edge-cache"), "HIT")
  assert.ok(stale.body.includes("Runtime canary revision A"))
  const freshOrigin = await get(origin, paths[0])
  assert.equal(freshOrigin.response.headers.get("x-start-cache"), "MISS")
  assert.ok(freshOrigin.body.includes("Runtime canary revision B"))
  results.push({
    check:
      "failed edge purge exits nonzero after origin invalidation; edge can remain stale",
    passed: true,
  })

  beforePurge = await redis.mGet(paths.map(generationKey))
  const retried = await cli([paths[0]])
  assert.equal(retried.code, 0, retried.output)
  assert.match(retried.output, /Origin and CDN invalidated/)
  assert.equal(
    purges.filter((purge) => purge.status === 200).length,
    languages.length + 1,
  )
  assert.ok(purges.some((purge) => purge.key === "app-org.mozilla.firefox"))
  for (const path of [paths[0], "/de/apps/org.mozilla.firefox"]) {
    const fresh = await get(edgeBase, path)
    assert.equal(fresh.response.headers.get("x-edge-cache"), "MISS")
    assert.ok(fresh.body.includes("Runtime canary revision B"))
    assert.equal(
      (await get(edgeBase, path)).response.headers.get("x-edge-cache"),
      "HIT",
    )
  }
  results.push({
    check:
      "retry purges all 56 locale page keys and app key; next edge fills are fresh",
    passed: true,
  })

  const protectedPage = await get(edgeBase, "/en/settings")
  assert.equal(protectedPage.response.status, 307)
  assert.equal(
    protectedPage.response.headers.get("cache-control"),
    "private, no-store",
  )
  const credentialed = await get(edgeBase, "/en/about", {
    headers: { cookie: "session=fixture" },
  })
  assert.equal(credentialed.response.headers.get("x-edge-cache"), "BYPASS")
  assert.equal(
    credentialed.response.headers.get("cache-control"),
    "private, no-store",
  )
  results.push({
    check: "protected and credentialed documents still bypass shared caches",
    passed: true,
  })
  const fixtureMissesAfter = (
    await (await fetch("http://127.0.0.1:4101/__fixtures/stats")).json()
  ).misses
  assert.deepEqual(
    fixtureMissesAfter.slice(fixtureMissesBefore),
    [],
    "Runtime checks must not rely on missing API fixtures",
  )
  console.log(
    `${results.length} packaged runtime/environment/invalidation checks passed; ${purges.length} local purge requests; no live CDN calls`,
  )
} finally {
  if (started) {
    await exec("podman", ["stop", container])
    const state = JSON.parse(
      (await exec("podman", ["inspect", container])).stdout,
    )[0].State
    results.push({
      check: "clean read-only container shutdown",
      exitCode: state.ExitCode,
    })
    await exec("podman", ["rm", container])
  }
  await Promise.all([
    new Promise((done) => gateway.close(done)),
    new Promise((done) => fastly.close(done)),
  ])
  await redis.quit()
  await writeFile(
    resolve(values.output, "runtime.json"),
    JSON.stringify(
      {
        image: values.image,
        site: values.site,
        publicApi: values["public-api"],
        results,
        purges,
        apiRequests,
      },
      null,
      2,
    ),
  )
}
