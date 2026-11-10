import Negotiator from "negotiator"
import { match } from "@formatjs/intl-localematcher"
import { languages } from "./locales.mjs"

const orderedLocales = [...languages].sort((a, b) => b.length - a.length)

export function headerLocale(headers) {
  const requested = new Negotiator({
    headers: { "accept-language": headers.get("accept-language") || undefined },
  }).languages()
  try {
    const matched = match(requested, orderedLocales, "en")
    return languages.find(
      (locale) => locale.toLowerCase() === matched.toLowerCase(),
    )
  } catch {
    return undefined
  }
}

function localeCookie(headers) {
  let value
  for (const cookie of (headers.get("cookie") || "").split(";")) {
    const [name, ...parts] = cookie.trim().split("=")
    if (name === "NEXT_LOCALE") {
      try {
        value = decodeURIComponent(parts.join("="))
      } catch {
        value = parts.join("=")
      }
    }
  }
  return value
}

export function localeRedirect(request) {
  const url = new URL(request.url)
  const path = url.pathname
  // Keep transport, assets and crawl endpoints outside locale negotiation.
  if (
    /^\/(?:api|_next|_vercel)/.test(path) ||
    /^\/(?:_serverFn|build-assets)(?:\/|$)/.test(path) ||
    /^\/(?:robots\.txt|sitemap(?:\.xml|\/)|favicon\.|apple-touch-icon\.|mockServiceWorker\.|\.well-known)/.test(
      path,
    )
  ) {
    return null
  }
  // Match the source proxy's dot-path exclusions and builds exception. Its
  // first-segment dot paths are rewrites, not negotiated redirects.
  if (path.includes(".") && !/^\/builds\/apps\/[^/]+$/.test(path)) {
    return null
  }
  let decoded
  try {
    decoded = decodeURI(path)
  } catch {
    return null
  }
  const sanitized = decoded
    .replace(/\\/g, "%5C")
    .replace(/[\t\n\r]/g, "")
    .replace(/\/+/g, "/")
  const prefix = sanitized.split("/")[1]
  const prefixedLocale = languages.find(
    (locale) => locale.toLowerCase() === prefix.toLowerCase(),
  )
  if (prefixedLocale === prefix) {
    return null
  }
  const cookie = localeCookie(request.headers)
  const accepted = headerLocale(request.headers)
  const locale =
    prefixedLocale || (languages.includes(cookie) ? cookie : accepted || "en")
  const suffix = prefixedLocale ? sanitized.slice(prefix.length + 1) : sanitized
  url.pathname = `/${locale}${suffix === "/" ? "" : suffix}`
  const headers = new Headers({
    location: url.pathname + url.search,
    "cache-control": "private, no-store",
    vary: "Accept-Language, Cookie, Sec-Fetch-Dest",
    "x-start-cache": "BYPASS",
  })
  const destination = request.headers.get("sec-fetch-dest")
  if (
    (destination === null || destination === "document") &&
    (cookie !== undefined ? cookie !== locale : accepted !== locale)
  ) {
    headers.set("set-cookie", `NEXT_LOCALE=${locale}; Path=/; SameSite=lax`)
  }
  return new Response(null, { status: 307, headers })
}
