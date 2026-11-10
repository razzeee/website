import { createRouter } from "@tanstack/react-router"
import { Buffer } from "buffer"
import { routeTree } from "./routeTree.gen"
import * as Sentry from "@sentry/tanstackstart-react"
globalThis.Buffer ??= Buffer
export function getRouter() {
  const router = createRouter({ routeTree, scrollRestoration: true })
  if (!router.isServer) {
    Sentry.addIntegration(
      Sentry.tanstackRouterBrowserTracingIntegration(router),
    )
  }
  return router
}
