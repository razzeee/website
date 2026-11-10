import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useRouter as useStartRouter,
  notFound as missing,
  redirect as move,
} from "@tanstack/react-router"
import { useLocale } from "use-intl"
import { useMemo } from "react"
import { localized, withoutLocale } from "../locales.mjs"
import { syncLocaleCookie } from "../locale-cookie.mjs"
export function Link({ href, locale, prefetch, replace, onClick, ...props }) {
  const current = useLocale()
  const to = localized(href, locale || current)
  const switchingLocale = locale != null && locale !== current
  return (
    <RouterLink
      to={to}
      replace={replace}
      {...props}
      hrefLang={switchingLocale ? locale : props.hrefLang}
      preload={switchingLocale || prefetch === false ? false : "intent"}
      onClick={(event) => {
        syncLocaleCookie(current, locale)
        onClick?.(event)
      }}
    />
  )
}
export function usePathname() {
  return useLocation({
    select: (location) => withoutLocale(location.pathname),
  })
}
export function useSearchParams() {
  const search = useLocation({ select: (location) => location.searchStr })
  return useMemo(() => new URLSearchParams(search), [search])
}
export function useRouter() {
  const navigate = useNavigate()
  const router = useStartRouter()
  const locale = useLocale()
  return useMemo(
    () => ({
      push: (href, options) => {
        syncLocaleCookie(locale, options?.locale)
        return navigate({ to: localized(href, options?.locale || locale) })
      },
      replace: (href, options) => {
        syncLocaleCookie(locale, options?.locale)
        return navigate({
          to: localized(href, options?.locale || locale),
          replace: true,
        })
      },
      refresh: () => router.invalidate(),
      back: () => router.history.back(),
      prefetch: (href) => router.preloadRoute({ to: localized(href, locale) }),
    }),
    [navigate, router, locale],
  )
}
export function notFound() {
  throw missing()
}
export function redirect(value) {
  throw move({
    href:
      typeof value === "string" ? value : localized(value.href, value.locale),
    statusCode: 307,
  })
}
export function getPathname({ href, locale }) {
  return localized(href, locale)
}
