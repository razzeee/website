import { test } from "node:test"
import assert from "node:assert/strict"
import { authorizePage, protectedRoute } from "../src/authorization.server.mjs"
import { publicPage, cacheableRequest } from "../src/cache.server.mjs"
import { applyCdnPolicy } from "../src/cdn.server.mjs"
import {
  protectedRoutes,
  matchProtectedRoute,
} from "../src/protected-routes.mjs"

const request = (cookie) =>
  new Request("https://example.test/_serverFn/page", {
    headers: cookie ? { cookie } : {},
  })
const user = (permissions = []) => ({
  auths: { email: {} },
  default_account: { provider: "email", login: "test@example.test" },
  permissions,
})

test("all protected shapes and descendants bypass shared caching", async () => {
  for (const [, pattern] of [
    ...protectedRoutes,
    ["settings", "settings"],
    ["developer", "developer-portal"],
    ["payment", "payment/:transaction_id"],
    ["register", "apps/new/register"],
  ]) {
    const path = `/zh-Hans/${pattern.replace(/:[^/]+/g, "123")}`
    assert.ok(protectedRoute(path), path)
    assert.equal(publicPage(path), false, path)
    assert.equal(
      cacheableRequest(new Request(`https://example.test${path}`)),
      false,
      path,
    )
    const response = await applyCdnPolicy(
      new Request(`https://example.test${path}`),
      new Response("secret", { headers: { "content-type": "text/html" } }),
    )
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-store",
      path,
    )
    assert.equal(response.headers.has("surrogate-key"), false, path)
  }
  assert.equal(protectedRoute("/en/administration"), null)
  assert.equal(protectedRoute("/en/donations"), null)
  assert.equal(protectedRoute("/en/apps/search?q=/admin"), null)
  assert.equal(
    matchProtectedRoute(["admin", "moderation", "permission-rules"]).kind,
    "admin-permission-rules",
  )
})

test("anonymous sessions redirect before backend calls and retain safe local return paths", async () => {
  for (const [path, expected] of [
    [
      "/zh-Hans/wallet?tab=history",
      "/zh-Hans/login?returnTo=%2Fwallet%3Ftab%3Dhistory",
    ],
    ["/nb-NO/admin/users", "/nb-NO/login/developer?returnTo=%2Fadmin%2Fusers"],
    [
      "/ar/apps/new/register",
      "/ar/login/developer?returnTo=%2Fapps%2Fnew%2Fregister",
    ],
  ]) {
    assert.deepEqual(
      await authorizePage(path, request(), {
        fetchSession: () => assert.fail("No session cookie"),
      }),
      { redirect: expected },
    )
  }
})

test("verified sessions preserve layout boundaries and admin permissions", async () => {
  for (const permissions of [
    [],
    ["payment"],
    ["moderation"],
    ["quality-moderation"],
    ["view-users"],
    ["modify-users"],
    ["manage-oidc-clients"],
  ]) {
    const fetchSession = async (url, options) => {
      assert.equal(url, "https://backend.test/auth/userinfo")
      assert.equal(options.headers.Cookie, "session=test")
      assert.equal(options.cache, "no-store")
      assert.equal(options.redirect, "error")
      return Response.json(user(permissions))
    }
    const options = { fetchSession, apiBase: "https://backend.test/" }
    assert.deepEqual(
      await authorizePage("/en/wallet", request("session=test"), options),
      { layout: "protected" },
    )
    assert.deepEqual(
      await authorizePage("/en/admin", request("session=test"), options),
      permissions.length && permissions[0] !== "payment"
        ? { layout: "admin" }
        : { redirect: "/en/unauthorized" },
    )
  }
})

test("permission review detail requires moderation, not just any admin permission", async () => {
  for (const permissions of [
    [],
    ["view-users"],
    ["quality-moderation"],
    ["moderation"],
  ]) {
    const fetchSession = async () => Response.json(user(permissions))
    assert.deepEqual(
      await authorizePage(
        "/zh-Hans/admin/moderation/permissions/123",
        request("session=test"),
        { fetchSession },
      ),
      permissions.includes("moderation")
        ? { layout: "admin" }
        : { redirect: "/zh-Hans/unauthorized" },
    )
  }
  assert.equal(
    matchProtectedRoute(["admin", "moderation", "permissions", "123"]).kind,
    "admin-permission-review",
  )
})

test("session failures, redirects and malformed replies fail closed", async () => {
  for (const fetchSession of [
    async () => new Response(null, { status: 204 }),
    async () => new Response(null, { status: 401 }),
    async () => new Response(null, { status: 500 }),
    async () => new Response(null, { status: 302 }),
    async () => Response.json({}),
    async () => Response.json(null),
    async () => new Response("invalid json"),
    async () => {
      throw new Error("backend unavailable")
    },
  ]) {
    assert.deepEqual(
      await authorizePage("/en/settings", request("session=invalid"), {
        fetchSession,
      }),
      { redirect: "/en/login?returnTo=%2Fsettings" },
    )
  }
  assert.deepEqual(
    await authorizePage("/en/admin", request("session=test"), {
      fetchSession: async () => Response.json(user("moderation")),
    }),
    { redirect: "/en/unauthorized" },
  )
})

test("app management preserves ownership and publisher-agreement boundaries", async () => {
  const authorize = (path, changes = {}) =>
    authorizePage(`/zh-Hans${path}`, request("session=test"), {
      fetchSession: async () => Response.json({ ...user(), ...changes }),
    })
  assert.deepEqual(await authorize("/apps/manage/org.example.Sandbox"), {
    redirect: "/zh-Hans/unauthorized",
  })
  assert.deepEqual(
    await authorize("/apps/manage/org.example.Sandbox", {
      permissions: ["moderation"],
    }),
    { redirect: "/zh-Hans/unauthorized" },
  )
  assert.deepEqual(
    await authorize("/apps/manage/org.example.Sandbox", {
      dev_flatpaks: ["org.example.Sandbox"],
    }),
    { layout: "protected" },
  )
  assert.deepEqual(await authorize("/apps/new/register"), {
    redirect: "/zh-Hans/apps/new/publisher-agreement",
  })
  assert.deepEqual(
    await authorize("/apps/new/register", {
      accepted_publisher_agreement_at: "2026-01-01T00:00:00Z",
    }),
    { layout: "protected" },
  )
  assert.deepEqual(
    await authorize("/apps/manage/org.example.Sandbox/accept-invite", {
      dev_flatpaks: ["org.example.Sandbox"],
    }),
    { redirect: "/zh-Hans/apps/manage/org.example.Sandbox" },
  )
  assert.deepEqual(
    await authorize("/apps/manage/org.example.Sandbox/accept-invite", {
      invited_flatpaks: ["org.example.Sandbox"],
    }),
    { layout: "protected" },
  )
  for (const path of [
    "/apps/new",
    "/apps/new/publisher-agreement",
    "/apps/manage/org.example.Sandbox/accept-invite/publisher-agreement",
  ]) {
    assert.deepEqual(await authorizePage(`/en${path}`, request()), {
      redirect: `/en/login?returnTo=${encodeURIComponent(path)}`,
    })
    assert.equal(publicPage(`/en${path}`), false)
  }
})

test("app purchase routes require login, not app ownership, and year pages never share cache", async () => {
  for (const path of [
    "/en/apps/org.example.App/purchase",
    "/en/apps/purchase/org.example.App",
  ]) {
    assert.deepEqual(await authorizePage(path, request()), {
      redirect: `/en/login?returnTo=${encodeURIComponent(path.slice(3))}`,
    })
    assert.deepEqual(
      await authorizePage(path, request("session=buyer"), {
        fetchSession: async () => Response.json(user()),
      }),
      { layout: "protected" },
    )
    assert.equal(publicPage(path), false)
  }
  for (const year of [2018, 2025, 2026, 9999]) {
    assert.equal(publicPage(`/en/year-in-review/${year}`), false)
  }
})
