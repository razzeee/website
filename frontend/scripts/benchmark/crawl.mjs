import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { output: { type: "string" } } })
assert.ok(values.output, "Provide --output")
const results = []
for (const [path, status] of [
  ["/robots.txt", 200],
  ["/sitemap.xml", 200],
  ["/sitemap/0.xml", 200],
  ["/sitemap/1.xml", 200],
  ["/sitemap/nope.xml", 404],
]) {
  const arms = []
  for (const port of [3000, 3001]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`)
    const body = (await response.text()).replace(
      /http:\/\/127\.0\.0\.1:300[01]/g,
      "http://site.test",
    )
    assert.equal(response.status, status, path)
    const head = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "HEAD",
    })
    assert.equal(head.status, status, path)
    assert.equal(await head.text(), "", path)
    arms.push({
      status: response.status,
      body,
      type: response.headers.get("content-type")?.split(";")[0],
    })
  }
  assert.deepEqual(arms[1], arms[0], path)
  results.push({ path, arms, head: "passed" })
}
await mkdir(values.output, { recursive: true })
await writeFile(
  resolve(values.output, "crawl-endpoints.json"),
  JSON.stringify(results, null, 2),
)
console.log(`${results.length} crawl endpoint GET/HEAD comparisons passed`)
