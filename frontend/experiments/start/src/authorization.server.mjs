import { isLocale, withoutLocale } from "./locales.mjs"
import { hasAdminAccess } from "../../../src/utils/admin-access.mjs"

export function protectedRoute(path) {
  const url = new URL(path, "https://route.invalid")
  const locale = url.pathname.split("/")[1]
  if (!isLocale(locale)) {
    return null
  }
  const route = withoutLocale(url.pathname)
  const roots = [
    "settings",
    "developer-portal",
    "wallet",
    "my-flathub",
    "donate",
    "admin",
    "purchase",
    "payment",
  ]
  const protectedPath =
    roots.some(
      (root) => route === `/${root}` || route.startsWith(`/${root}/`),
    ) ||
    route === "/apps/new" ||
    route.startsWith("/apps/new/") ||
    route.startsWith("/apps/manage/") ||
    /^\/apps\/(?:purchase\/[^/]+|[^/]+\/purchase)$/.test(route)
  if (!protectedPath) {
    return null
  }
  return {
    locale,
    route,
    admin: route === "/admin" || route.startsWith("/admin/"),
    moderation: /^\/admin\/moderation\/permissions\/[^/]+$/.test(route),
    managedApp: route.match(/^\/apps\/manage\/([^/]+)$/)?.[1],
    invitedApp: route.match(/^\/apps\/manage\/([^/]+)\/accept-invite$/)?.[1],
    publisherAgreement: route === "/apps/new/register",
    developer:
      route === "/developer-portal" ||
      route.startsWith("/admin") ||
      route === "/apps/new/register",
    returnTo: route + url.search,
  }
}

export async function authorizePage(
  path,
  request,
  {
    fetchSession = fetch,
    apiBase = process.env.API_BASE_URI || "http://backend:8000",
  } = {},
) {
  const boundary = protectedRoute(path)
  if (!boundary) {
    return null
  }
  const login = new URL(
    `/${boundary.locale}/login${boundary.developer ? "/developer" : ""}`,
    "https://route.invalid",
  )
  login.searchParams.set("returnTo", boundary.returnTo)
  const cookie = request.headers.get("cookie")
  let user
  if (cookie) {
    try {
      const response = await fetchSession(
        `${apiBase.replace(/\/$/, "")}/auth/userinfo`,
        {
          headers: { Cookie: cookie, Accept: "application/json" },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        },
      )
      if (response.ok && response.status !== 204) {
        user = await response.json()
      }
    } catch {
      // Fail closed when the backend cannot verify a session.
    }
  }
  if (
    !user ||
    typeof user !== "object" ||
    Array.isArray(user) ||
    !user.auths ||
    typeof user.auths !== "object" ||
    !user.default_account ||
    typeof user.default_account !== "object"
  ) {
    return { redirect: login.pathname + login.search }
  }
  if (boundary.admin && !hasAdminAccess(user)) {
    return { redirect: `/${boundary.locale}/unauthorized` }
  }
  if (
    boundary.moderation &&
    (!Array.isArray(user.permissions) ||
      !user.permissions.includes("moderation"))
  ) {
    return { redirect: `/${boundary.locale}/unauthorized` }
  }
  if (
    boundary.managedApp &&
    (!Array.isArray(user.dev_flatpaks) ||
      !user.dev_flatpaks.includes(boundary.managedApp))
  ) {
    return { redirect: `/${boundary.locale}/unauthorized` }
  }
  if (boundary.publisherAgreement && !user.accepted_publisher_agreement_at) {
    return { redirect: `/${boundary.locale}/apps/new/publisher-agreement` }
  }
  if (
    boundary.invitedApp &&
    Array.isArray(user.dev_flatpaks) &&
    user.dev_flatpaks.includes(boundary.invitedApp)
  ) {
    return {
      redirect: `/${boundary.locale}/apps/manage/${boundary.invitedApp}`,
    }
  }
  return { layout: boundary.admin ? "admin" : "protected" }
}
