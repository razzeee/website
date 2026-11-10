import { isLocale } from "./locales.mjs"

export function syncLocaleCookie(currentLocale, nextLocale) {
  if (
    typeof document === "undefined" ||
    nextLocale === currentLocale ||
    !isLocale(nextLocale)
  ) {
    return
  }
  document.cookie = `NEXT_LOCALE=${nextLocale}; SameSite=lax; Path=/`
}
