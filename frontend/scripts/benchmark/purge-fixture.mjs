const target = new URL(process.env.PURGE_FIXTURE_ORIGIN)
if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") {
  throw new Error("The purge fixture must use an explicit loopback HTTP origin")
}
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  )
  if (url.origin !== "https://api.fastly.com") {
    throw new Error("Unexpected outbound request in purge fixture")
  }
  return originalFetch(new URL(url.pathname, target), init)
}
