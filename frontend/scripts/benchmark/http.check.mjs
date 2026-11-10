import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

test("HTTP runner retains invalid responses and never follows redirects", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "benchmark-http-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const paths = []
  const server = createServer((req, res) => {
    paths.push(req.url)
    if (req.url === "/redirect") {
      res.writeHead(308, { Location: "/destination" }).end()
    } else {
      res.end("Empty fallback")
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const routes = join(directory, "routes.json")
  const output = join(directory, "result.json")
  await writeFile(
    routes,
    JSON.stringify([
      { path: "/redirect", status: 308, location: "/destination" },
      { path: "/content", status: 200, contains: "Firefox" },
    ]),
  )
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      fileURLToPath(new URL("./http.mjs", import.meta.url)),
      "--base-url",
      `http://127.0.0.1:${server.address().port}`,
      "--routes",
      routes,
      "--output",
      output,
      "--label",
      "harness-check",
      "--samples",
      "2",
    ]),
    { code: 1 },
  )
  const report = JSON.parse(await readFile(output, "utf8"))
  assert.equal(report.results.length, 4)
  assert.equal(report.summary[0].failures, 0)
  assert.equal(report.summary[1].failures, 2)
  assert.equal(report.summary[1].completeMsP95, null)
  assert.equal(paths.includes("/destination"), false)
  assert.equal(report.lockfileSha256.length, 64)
})
