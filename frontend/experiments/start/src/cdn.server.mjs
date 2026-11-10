import { createHash } from "node:crypto"
import { cacheableRequest } from "./cache.server.mjs"
import { isLocale, languages, withoutLocale } from "./locales.mjs"

export function surrogateKeys(path) {
  const keys = [
    "start-pages",
    `page-${createHash("sha256").update(path).digest("hex")}`,
  ]
  const app =
    isLocale(path.split("/")[1]) &&
    withoutLocale(path).match(/^\/apps\/([A-Za-z0-9_.-]+)$/)
  if (app) {
    keys.push(`app-${app[1]}`)
  }
  return keys
}

export async function applyCdnPolicy(
  request,
  response,
  renderedAt = Date.now(),
) {
  const ttl = Math.max(
    0,
    Math.min(300, Math.floor((renderedAt + 3600000 - Date.now()) / 1000)),
  )
  const shared =
    cacheableRequest(request) &&
    response.status === 200 &&
    response.headers.get("content-type")?.includes("text/html") &&
    !response.headers.has("set-cookie") &&
    !/private|no-store/i.test(response.headers.get("cache-control") || "") &&
    !(response.headers.get("vary") || "")
      .split(",")
      .some((value) => value.trim() === "*") &&
    ttl > 0
  if (!shared) {
    response.headers.set("cache-control", "private, no-store")
    response.headers.delete("surrogate-key")
    return response
  }
  const headers = new Headers(response.headers)
  for (const name of ["content-length", "etag", "sentry-trace", "baggage"]) {
    headers.delete(name)
  }
  headers.set(
    "cache-control",
    `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=60`,
  )
  headers.set(
    "surrogate-key",
    surrogateKeys(new URL(request.url).pathname).join(" "),
  )
  // Edge rules must also pass credential-bearing requests before cache lookup.
  const vary = new Set(
    (headers.get("vary") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  vary.add("Cookie")
  vary.add("Authorization")
  vary.add("X-Tsr-Redirect")
  headers.set("vary", [...vary].join(", "))
  return stripSharedTrace(
    new Response(response.body, { status: response.status, headers }),
  )
}

export async function stripSharedTrace(response) {
  if (
    !response.headers.get("content-type")?.includes("text/html") ||
    !response.headers.get("cache-control")?.startsWith("public,")
  ) {
    return response
  }
  // Run after Sentry's wrapper, which injects trace metadata into its response.
  const body = (await response.text()).replace(
    /<meta name="(?:sentry-trace|baggage)" content="[^"]*"\s*\/?\s*>/g,
    "",
  )
  const headers = new Headers(response.headers)
  for (const name of ["content-length", "etag", "sentry-trace", "baggage"]) {
    headers.delete(name)
  }
  return new Response(body, { status: response.status, headers })
}

export async function invalidatePages(paths, { cache, purge }) {
  const affected = [
    ...new Set(
      paths.flatMap((path) => {
        const app =
          isLocale(path.split("/")[1]) &&
          withoutLocale(path).match(/^(\/apps\/[A-Za-z0-9_.-]+)$/)
        return app ? languages.map((locale) => `/${locale}${app[1]}`) : [path]
      }),
    ),
  ]
  // Invalidate origin first so a subsequent edge miss cannot refill old data.
  for (const path of affected) {
    await cache.invalidate(path)
  }
  const keys = [
    ...new Set(affected.flatMap((path) => surrogateKeys(path).slice(1))),
  ]
  await purge(keys)
  return keys
}
