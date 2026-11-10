import { readFile } from "node:fs/promises"

if (!process.env.DOCUMENTATION_FEED_FIXTURE) {
  throw new Error(
    "Provide DOCUMENTATION_FEED_FIXTURE when using the documentation fixture preload",
  )
}
const feed = JSON.parse(
  await readFile(process.env.DOCUMENTATION_FEED_FIXTURE, "utf8"),
)
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  if (url === "https://docs.flathub.org/blog/feed.json") {
    return Promise.resolve(
      Response.json(feed, { headers: { "cache-control": "no-store" } }),
    )
  }
  return originalFetch(input, init)
}
