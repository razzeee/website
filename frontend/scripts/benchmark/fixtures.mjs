import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { pathToFileURL } from "node:url"

const digest = (value) => createHash("sha256").update(value).digest("hex")

export function createFixtureServer({ directory, upstream, mode = "replay" }) {
  if (!["record", "replay"].includes(mode)) {
    throw new Error("Invalid mode")
  }
  const pending = new Map()
  const stats = {
    mode,
    requests: 0,
    hits: 0,
    recorded: 0,
    misses: [],
    errors: [],
  }

  async function fixture(key) {
    const filename = resolve(directory, `${digest(key)}.json`)
    try {
      const saved = JSON.parse(await readFile(filename, "utf8"))
      if (
        saved.key !== key ||
        digest(Buffer.from(saved.body, "base64")) !== saved.sha256
      ) {
        throw new Error(`Corrupt fixture: ${key}`)
      }
      stats.hits++
      return saved
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error
      }
      if (mode !== "record") {
        stats.misses.push(key)
        throw new Error(`Missing fixture: ${key}`)
      }
    }
    const response = await fetch(`${upstream.replace(/\/$/, "")}${key}`, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: { accept: "application/json" },
    })
    if (!response.ok && ![400, 404].includes(response.status)) {
      throw new Error(`Upstream ${response.status}: ${key}`)
    }
    if (response.headers.has("set-cookie")) {
      throw new Error(`Refusing session response: ${key}`)
    }
    const body = Buffer.from(await response.arrayBuffer())
    const saved = {
      key,
      source: upstream,
      capturedAt: new Date().toISOString(),
      status: response.status,
      contentType: response.headers.get("content-type"),
      sha256: digest(body),
      body: body.toString("base64"),
    }
    await mkdir(directory, { recursive: true })
    await writeFile(filename, JSON.stringify(saved) + "\n", { flag: "wx" })
    stats.recorded++
    return saved
  }

  return createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    if (req.url === "/__fixtures/stats") {
      try {
        const files = (await readdir(directory))
          .filter((file) => file.endsWith(".json"))
          .sort()
        const hashes = await Promise.all(
          files.map(async (file) => [
            file,
            digest(await readFile(resolve(directory, file))),
          ]),
        )
        res.setHeader("Content-Type", "application/json")
        res.end(
          JSON.stringify({
            ...stats,
            fixtureCount: files.length,
            snapshotSha256: digest(JSON.stringify(hashes)),
          }),
        )
      } catch (error) {
        res.writeHead(500).end(error.message)
      }
      return
    }
    stats.requests++
    const url = new URL(req.url, "http://localhost")
    if (
      req.method !== "GET" ||
      req.headers.authorization ||
      req.headers.cookie ||
      !req.url.startsWith("/") ||
      req.url.startsWith("//") ||
      (url.pathname !== "/auth/login" &&
        /(?:auth|login|logout|user|account|payment|admin|token)/i.test(
          url.pathname,
        ))
    ) {
      stats.errors.push(`Rejected ${req.method} ${url.pathname}`)
      res.writeHead(403).end("Only anonymous public GET fixtures are supported")
      return
    }
    // Preserve query order and repeated values exactly as sent by the client.
    const key = `${url.pathname}${url.search}`
    try {
      if (!pending.has(key)) {
        pending.set(
          key,
          fixture(key).finally(() => pending.delete(key)),
        )
      }
      const saved = await pending.get(key)
      res.writeHead(saved.status, {
        "Content-Type": saved.contentType || "application/octet-stream",
        "Cache-Control": "no-store",
      })
      res.end(Buffer.from(saved.body, "base64"))
    } catch (error) {
      stats.errors.push(error.message)
      res.writeHead(502).end(error.message)
    }
  })
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({
    options: {
      directory: { type: "string" },
      upstream: { type: "string" },
      mode: { type: "string", default: "replay" },
      port: { type: "string", default: "4100" },
    },
  })
  if (!values.directory || (values.mode === "record" && !values.upstream)) {
    throw new Error("Provide --directory and, for recording, --upstream")
  }
  const server = createFixtureServer(values)
  server.listen(Number(values.port), "127.0.0.1", () => {
    console.log(
      `Fixture ${values.mode} server: http://127.0.0.1:${values.port}`,
    )
  })
}
