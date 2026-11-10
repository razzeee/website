import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react"
import { applyCdnPolicy, stripSharedTrace } from "./cdn.server.mjs"
import { pageCache, cacheableRequest } from "./cache.server.mjs"
import { endpoint } from "./endpoints.server"
import { redirectResponse, applyHeaders } from "./http-policy.server"
import { localeRedirect } from "./locale-negotiation.server.mjs"

const tracedHandler = createServerEntry(
  wrapFetchWithSentry({
    async fetch(request, options) {
      const path = new URL(request.url).pathname
      const redirect = redirectResponse(request)
      if (redirect) {
        return applyHeaders(request, redirect)
      }
      const negotiation = localeRedirect(request)
      if (negotiation) {
        return applyHeaders(request, negotiation)
      }
      if (
        path.startsWith("/api/") ||
        path === "/robots.txt" ||
        path === "/sitemap.xml" ||
        path.startsWith("/sitemap/")
      ) {
        const result = await endpoint(request)
        return applyHeaders(
          request,
          request.method === "HEAD"
            ? new Response(null, {
                status: result.status,
                headers: result.headers,
              })
            : result,
        )
      }
      const cache = pageCache()
      let response
      let renderedAt = Date.now()
      if (cache && cacheableRequest(request)) {
        let rendered
        const result = await cache.cached(path, "html", async () => {
          rendered = await handler.fetch(request, options)
          if (
            rendered.status !== 200 ||
            rendered.headers.has("set-cookie") ||
            /private|no-store/.test(rendered.headers.get("cache-control") || "")
          ) {
            return null
          }
          return {
            renderedAt: Date.now(),
            body: await rendered.text(),
            headers: [...rendered.headers],
            status: rendered.status,
          }
        })
        renderedAt = result.value?.renderedAt ?? 0
        response = result.value
          ? new Response(result.value.body, {
              headers: result.value.headers,
              status: result.value.status,
            })
          : rendered
        response.headers.set("x-start-cache", result.state)
      } else {
        response = await handler.fetch(request, options)
        response.headers.set("x-start-cache", "BYPASS")
      }
      if (path.includes("/login") || path.includes("/settings")) {
        response.headers.set("cache-control", "private, no-store")
      }
      if (path.endsWith("/login/email/confirm")) {
        response.headers.set("referrer-policy", "no-referrer")
      }
      return applyCdnPolicy(
        request,
        applyHeaders(request, response),
        renderedAt,
      )
    },
  }),
)

export default createServerEntry({
  async fetch(request, options) {
    return stripSharedTrace(await tracedHandler.fetch(request, options))
  },
})
