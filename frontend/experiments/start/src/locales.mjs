import { languages } from "../../../src/i18n/locales.mjs"

export { languages }
const supported = new Set(languages)
export const isLocale = (locale) => supported.has(locale)

export function withoutLocale(path) {
  return (
    path.replace(/^\/([^/?#]+)(?=\/|[?#]|$)/, (prefix, locale) =>
      isLocale(locale) ? "" : prefix,
    ) || "/"
  )
}

export function localized(href, locale) {
  let path = href
  if (typeof href !== "string") {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(href.query || {})) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item != null) {
          query.append(key, String(item))
        }
      }
    }
    path = href.pathname + (query.size ? `?${query}` : "") + (href.hash || "")
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    return path
  }
  const suffix = withoutLocale(path)
  return `/${locale}${suffix === "/" ? "" : suffix}`
}
