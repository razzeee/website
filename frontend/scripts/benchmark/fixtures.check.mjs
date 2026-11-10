import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { createFixtureServer } from "./fixtures.mjs"

async function listen(server, t) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test("recorded bytes replay without upstream and unknown queries fail closed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "benchmark-fixtures-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let reads = 0
  const upstream = await listen(
    createServer((req, res) => {
      reads++
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ hits: ["Firefox"], query: req.url }))
    }),
    t,
  )
  const recorder = await listen(
    createFixtureServer({ directory, upstream, mode: "record" }),
    t,
  )
  const key = "/collection?locale=en&tag=a&tag=b"
  const recorded = await (await fetch(recorder + key)).text()
  assert.equal(reads, 1)
  const replay = await listen(createFixtureServer({ directory, upstream }), t)
  assert.equal(await (await fetch(replay + key)).text(), recorded)
  assert.equal(reads, 1)
  assert.equal((await fetch(replay + "/collection?locale=de")).status, 502)
  assert.equal(reads, 1)
  const stats = await (await fetch(replay + "/__fixtures/stats")).json()
  assert.deepEqual(stats.misses, ["/collection?locale=de"])
  assert.equal(stats.errors.length, 1)

  const [file] = await readdir(directory)
  const saved = JSON.parse(await readFile(join(directory, file), "utf8"))
  saved.body = Buffer.from("wrong content").toString("base64")
  await writeFile(join(directory, file), JSON.stringify(saved))
  assert.equal((await fetch(replay + key)).status, 502)
})

test("capture refuses credentials and mutation requests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "benchmark-fixtures-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const base = await listen(createFixtureServer({ directory }), t)
  for (const [path, options] of [
    ["/auth/userinfo", {}],
    ["/appstream/test", { method: "POST" }],
    ["/appstream/test", { headers: { cookie: "session=example" } }],
    ["/appstream/test", { headers: { authorization: "Bearer example" } }],
  ]) {
    assert.equal((await fetch(base + path, options)).status, 403)
  }
  assert.deepEqual(await readdir(directory), [])
})
