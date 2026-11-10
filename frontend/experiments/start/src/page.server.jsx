import "../../../src/utils/axios-config"
import { withLocale } from "./adapters/intl-server"
import * as home from "../../../app/[locale]/(home)/page"
import * as app from "../../../app/[locale]/apps/[appId]/page"
import * as category from "../../../app/[locale]/apps/category/[category]/[page]/page"
import * as about from "../../../app/[locale]/about/page"
import * as search from "../../../app/[locale]/apps/search/page"
import { notFound, redirect } from "@tanstack/react-router"
import { pageCache, publicPage } from "./cache.server.mjs"
import { serializeAuthTree } from "./auth-tree.server"
import * as login from "../../../app/[locale]/login/page"
import * as email from "../../../app/[locale]/login/email/page"
import * as confirm from "../../../app/[locale]/login/email/confirm/page"
import * as developer from "../../../app/[locale]/login/developer/page"
import * as service from "../../../app/[locale]/login/[service]/page"
import * as settings from "../../../app/[locale]/(protected)/settings/page"
import { isLocale } from "./locales.mjs"
import { matchPublicRoute } from "./public-routes.mjs"
import { publicPages } from "./public-pages.server"
import { generateMetadata as layoutMetadata } from "../../../app/[locale]/metadata"
import { metadataHead } from "./metadata.mjs"
import { getRequest } from "@tanstack/react-start/server"
import { authorizePage } from "./authorization.server.mjs"
import { matchProtectedRoute } from "./protected-routes.mjs"
import { protectedPages } from "./protected-pages.server"
import { serializePageTree } from "./page-tree"

export async function loadPage(path) {
  const authorization = await authorizePage(path, getRequest())
  if (authorization?.redirect) {
    throw redirect({ href: authorization.redirect, statusCode: 307 })
  }
  const cache = pageCache()
  if (cache && publicPage(path)) {
    return (await cache.cached(path, "data", () => renderPage(path))).value
  }
  return renderPage(path, authorization?.layout)
}

async function renderPage(path, layout) {
  if (path === "/home") {
    throw redirect({ href: "/en/", statusCode: 308 })
  }
  const [locale, ...segments] = path.split("?")[0].split("/").filter(Boolean)
  if (!isLocale(locale)) {
    throw notFound()
  }
  let pageModule,
    kind,
    params = { locale }
  const publicRoute = matchPublicRoute(segments)
  const protectedRoute = matchProtectedRoute(segments)
  if (protectedRoute) {
    kind = protectedRoute.kind
    params = { ...params, ...protectedRoute.params }
    pageModule = await protectedPages[kind]()
  } else if (publicRoute) {
    kind = publicRoute.kind
    params = { ...params, ...publicRoute.params }
    pageModule = await publicPages[kind]()
  } else if (!segments.length) {
    pageModule = home
    kind = "home"
  } else if (segments[0] === "login") {
    kind = "auth"
    if (segments.length === 1) {
      pageModule = login
    } else if (segments.join("/") === "login/email/confirm") {
      pageModule = confirm
    } else if (segments.join("/") === "login/email") {
      pageModule = email
    } else if (segments.join("/") === "login/developer") {
      pageModule = developer
    } else if (segments.length === 2) {
      pageModule = service
    } else {
      throw notFound()
    }
  } else if (segments.join("/") === "settings") {
    kind = "settings"
    pageModule = settings
  } else if (segments.join("/") === "about") {
    pageModule = about
    kind = "about"
  } else if (segments.join("/") === "apps/search") {
    pageModule = search
    kind = "search"
  } else if (segments[0] === "apps" && segments[1] === "category") {
    if (segments.length === 3) {
      throw redirect({
        href: `/${locale}/apps/category/${segments[2]}/1`,
        statusCode: 308,
      })
    }
    if (segments.length !== 4) {
      throw notFound()
    }
    pageModule = category
    kind = "category"
    params = { ...params, category: segments[2], page: segments[3] }
  } else if (segments[0] === "apps" && segments.length === 2) {
    pageModule = app
    kind = "app"
    params.appId = segments[1]
  } else {
    throw notFound()
  }
  return withLocale(locale, async (messages) => {
    const input = {
      params: Promise.resolve(params),
      searchParams: Promise.resolve(
        Object.fromEntries(new URLSearchParams(path.split("?")[1])),
      ),
    }
    const element = await pageModule.default(input)
    const metadata =
      (await pageModule.generateMetadata?.(input)) || pageModule.metadata || {}
    const yearTree =
      kind === "year-in-review"
        ? serializePageTree(
            element,
            (await import("./year-in-review")).yearComponents,
          )
        : null
    return {
      kind,
      layout,
      locale,
      messages,
      head: metadataHead(await layoutMetadata(), metadata),
      props:
        kind === "year-in-review"
          ? { tree: yearTree }
          : kind === "admin-permission-review"
            ? element.props.children.props
            : kind === "setup"
              ? {
                  ...element.props.children[1].props,
                  structuredData:
                    element.props.children[0].props.dangerouslySetInnerHTML
                      .__html,
                }
              : kind === "auth" || kind === "unauthorized"
                ? { tree: serializeAuthTree(element) }
                : kind === "search"
                  ? {}
                  : element.props,
    }
  })
}
