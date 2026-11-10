import { createServer } from "node:http"
import { parseArgs } from "node:util"
import { pathToFileURL } from "node:url"
import { createFixtureServer } from "./fixtures.mjs"
import {
  permissionReview,
  paymentTransaction,
  managedApp,
  vendingConfig,
  purchaseApp,
  donationApp,
  publishedYear,
  yearReview,
} from "./protected-fixtures.mjs"

export function createSandbox(directory) {
  const fixtures = createFixtureServer({ directory })
  const events = []
  const appSessions = new Map()
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost")
    const session = (req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("sandbox_session="))
      ?.slice("sandbox_session=".length)
    const authenticated = [
      "valid",
      "admin",
      "moderator",
      "curator",
      "owner",
      "publisher",
      "invited",
      "invited-publisher",
    ].includes(session)
    const appSession = appSessions.get(session) || {
      accepted: ["owner", "publisher", "invited-publisher"].includes(session),
      owner: session === "owner",
      invited: ["invited", "invited-publisher"].includes(session),
    }
    const origin = req.headers.origin
    if (origin && /^http:\/\/127\.0\.0\.1:300[01]$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin)
      res.setHeader("Access-Control-Allow-Credentials", "true")
      res.setHeader(
        "Access-Control-Allow-Headers",
        "content-type,sentry-trace,baggage",
      )
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    }
    if (req.method === "OPTIONS") {
      return res.writeHead(204).end()
    }
    const json = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      res.end(JSON.stringify(body))
    }
    if (url.pathname === "/__sandbox/events") {
      return json(200, events)
    }
    if (url.pathname === "/__sandbox/reset-apps" && req.method === "POST") {
      appSessions.clear()
      return json(200, {})
    }
    if (/^\/api\/1\/envelope\/?$/.test(url.pathname)) {
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      events.push({
        path: url.pathname,
        envelope: Buffer.concat(chunks).toString(),
      })
      return json(200, {})
    }
    if (url.pathname === "/auth/email/config") {
      return json(200, { enabled: true })
    }
    if (url.pathname === "/users/me") {
      if (!authenticated) {
        return json(401, {})
      }
      return json(200, {
        id: 1,
        display_name: "Sandbox User",
        default_account: null,
        banned: false,
        connected_accounts: [],
        accepted_publisher_agreement_at: appSession.accepted
          ? "2026-01-01T00:00:00Z"
          : null,
        roles: [],
        github_repos: [],
        owned_apps: [],
      })
    }
    if (url.pathname === "/auth/userinfo") {
      if (!authenticated) {
        return res.writeHead(204).end()
      }
      const account = {
        login: "sandbox@example.test",
        provider: "email",
        avatar: null,
      }
      return json(200, {
        displayname: "Sandbox User",
        auths: { email: account },
        default_account: account,
        accepted_publisher_agreement_at: appSession.accepted
          ? "2026-01-01T00:00:00Z"
          : null,
        dev_flatpaks: appSession.owner ? [managedApp.id] : [],
        owned_flatpaks: [],
        invited_flatpaks: appSession.invited ? [managedApp.id] : [],
        permissions:
          session === "admin"
            ? ["view-users"]
            : session === "moderator"
              ? ["moderation"]
              : session === "curator"
                ? ["quality-moderation"]
                : [],
        invite_code: "sandbox",
        email_login: null,
      })
    }
    if (url.pathname === "/auth/passkeys" && req.method === "GET") {
      return json(200, { credentials: [] })
    }
    if (
      req.method === "GET" &&
      url.pathname === `/appstream/${managedApp.id}`
    ) {
      return json(200, managedApp)
    }
    if (req.method === "GET" && url.pathname === "/vending/config") {
      return json(200, vendingConfig)
    }
    const purchase = [purchaseApp, donationApp].find(
      (app) =>
        url.pathname === `/appstream/${app.id}` ||
        url.pathname === `/vendingapp/${app.id}/setup` ||
        url.pathname === `/vendingapp/${app.id}`,
    )
    if (purchase && req.method === "GET") {
      if (url.pathname.startsWith("/appstream/")) {
        return json(200, purchase)
      }
      return json(200, {
        status: "ok",
        minimum_payment: purchase.id === donationApp.id ? 0 : 100,
        recommended_donation: 500,
        appshare: 70,
      })
    }
    if (url.pathname === "/purchases/storefront-info" && req.method === "GET") {
      return json(200, {
        pricing: {
          minimum_payment:
            url.searchParams.get("app_id") === donationApp.id ? 0 : 100,
        },
      })
    }
    if (
      purchase &&
      req.method === "POST" &&
      url.pathname === `/vendingapp/${purchase.id}`
    ) {
      if (!authenticated) {
        return json(401, {})
      }
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}")
      events.push({ path: url.pathname, body })
      return json(200, { transaction: "123" })
    }
    if (/^\/year-in-review\/\d+$/.test(url.pathname) && req.method === "GET") {
      const year = Number(url.pathname.split("/").at(-1))
      const current = new Date().getUTCFullYear()
      events.push({
        kind: "year-review",
        year,
        cookieForwarded: !!req.headers.cookie,
        session: session || "anonymous",
      })
      if (
        year < 2018 ||
        year > current ||
        (year > publishedYear() && session !== "curator")
      ) {
        return json(422, { detail: "Year not available" })
      }
      return json(200, yearReview(year))
    }
    if (url.pathname === `/invites/${managedApp.id}` && req.method === "GET") {
      if (!authenticated) {
        return json(401, {})
      }
      return json(200, {
        is_pending: appSession.invited,
        is_direct_upload_app: false,
      })
    }
    if (
      url.pathname === `/invites/${managedApp.id}/accept` &&
      req.method === "POST"
    ) {
      if (!authenticated || !appSession.invited || !appSession.accepted) {
        return json(403, {})
      }
      appSessions.set(session, { ...appSession, owner: true, invited: false })
      events.push({ path: url.pathname, session })
      return json(200, {})
    }
    if (url.pathname === `/summary/${managedApp.id}` && req.method === "GET") {
      return json(200, {
        metadata: {
          runtime: "org.example.Platform/x86_64/1",
          runtimeIsEol: false,
        },
      })
    }
    if (
      url.pathname === `/moderation/apps/${managedApp.id}` &&
      req.method === "GET"
    ) {
      return json(appSession.owner ? 200 : 403, {
        requests_count: 0,
        requests: [],
      })
    }
    if (
      url.pathname === `/upload-tokens/${managedApp.id}` &&
      req.method === "GET"
    ) {
      return json(appSession.owner ? 200 : 403, {
        allowed_repos: ["beta", "stable"],
        tokens: [],
      })
    }
    if (
      url.pathname === `/vendingapp/${managedApp.id}/setup` &&
      req.method === "GET"
    ) {
      return json(appSession.owner ? 200 : 403, {
        status: "disabled",
        recommended_donation: 0,
        minimum_payment: 0,
        appshare: 50,
      })
    }
    if (url.pathname === "/vending/status" && req.method === "GET") {
      return json(200, { details_submitted: false })
    }
    if (
      url.pathname === `/verification/${managedApp.id}/status` &&
      req.method === "GET"
    ) {
      return json(200, { verified: true, method: "manual" })
    }
    if (
      url.pathname === `/verification/${managedApp.id}/available-methods` &&
      req.method === "GET"
    ) {
      return json(appSession.owner ? 200 : 403, { methods: [] })
    }
    if (url.pathname === "/users" && req.method === "GET") {
      if (session !== "admin") {
        return json(403, {})
      }
      return json(200, {
        users: [],
        pagination: { page: 1, page_size: 30, total: 0, total_pages: 1 },
      })
    }
    if (url.pathname === "/wallet/stripedata" && req.method === "GET") {
      return json(200, { public_key: "pk_test_sandbox" })
    }
    if (
      /^\/wallet\/transactions\/[^/]+(?:\/stripe)?$/.test(url.pathname) &&
      req.method === "GET"
    ) {
      if (
        !authenticated ||
        !/^\/wallet\/transactions\/123(?:\/stripe)?$/.test(url.pathname)
      ) {
        return json(403, {})
      }
      return json(
        200,
        url.pathname.endsWith("/stripe")
          ? { client_secret: "pi_sandbox_secret_fixture" }
          : paymentTransaction,
      )
    }
    if (
      url.pathname.startsWith("/moderation/permission-reviews") &&
      req.method === "GET"
    ) {
      if (session !== "moderator") {
        return json(403, {})
      }
      if (url.pathname === "/moderation/permission-reviews") {
        return json(200, { items: [{ assessment_id: 123 }], total: 1 })
      }
      if (url.pathname === "/moderation/permission-reviews/123") {
        return json(200, permissionReview)
      }
      return json(404, {})
    }
    if (req.method === "POST" && url.pathname.startsWith("/auth/")) {
      const chunks = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      let body
      try {
        body = JSON.parse(Buffer.concat(chunks).toString() || "{}")
      } catch {
        return json(400, {})
      }
      events.push({ path: url.pathname, body })
      if (url.pathname === "/auth/accept-publisher-agreement") {
        if (!authenticated) {
          return json(401, {})
        }
        appSessions.set(session, { ...appSession, accepted: true })
        return json(200, {})
      }
      if (url.pathname === "/auth/email/request") {
        return json(202, {})
      }
      if (url.pathname === "/auth/logout") {
        res.setHeader(
          "Set-Cookie",
          "sandbox_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
        )
        return json(200, {})
      }
      if (url.pathname === "/auth/email/confirm") {
        if (body.token === "conflict") {
          return json(409, {})
        }
        if (body.token === "limited") {
          res.setHeader("Retry-After", "60")
          return json(429, {})
        }
        if (body.token !== "valid") {
          return json(400, {})
        }
        res.setHeader(
          "Set-Cookie",
          "sandbox_session=valid; Path=/; HttpOnly; SameSite=Lax",
        )
        return json(200, { return_to: "/settings" })
      }
      if (url.pathname === "/auth/login/github") {
        if (body.code !== "valid" || body.state !== "sandbox") {
          return json(400, { error: "invalid-state" })
        }
        res.setHeader(
          "Set-Cookie",
          "sandbox_session=valid; Path=/; HttpOnly; SameSite=Lax",
        )
        return json(200, {})
      }
      return json(404, {})
    }
    fixtures.emit("request", req, res)
  })
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({
    options: {
      directory: { type: "string" },
      port: { type: "string", default: "4101" },
    },
  })
  if (!values.directory) {
    throw new Error("Provide --directory")
  }
  createSandbox(values.directory).listen(Number(values.port), "127.0.0.1", () =>
    console.log("Sandbox ready"),
  )
}
