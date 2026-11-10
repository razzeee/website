import { test } from "node:test"
import assert from "node:assert/strict"
import { redirectResponse, applyHeaders } from "../src/http-policy.server.js"
import { headers } from "../../../http-policy.mjs"

const request = (path) => new Request(`https://example.test${path}`)

test("redirects preserve order, wildcard paths, schemes and query values", () => {
  for (const [path, target, status] of [
    ["/home?tag=a&tag=b", "https://example.test/en/?tag=a&tag=b", 308],
    [
      "/apps/details/org.mozilla.firefox",
      "https://example.test/en/apps/org.mozilla.firefox",
      308,
    ],
    [
      "/en/apps/category/graphics",
      "https://example.test/en/apps/category/graphics/1",
      308,
    ],
    [
      "/apps/category/graphics",
      "https://example.test/en/apps/category/graphics",
      308,
    ],
    ["/apps/category/All/2", "https://example.test/en/", 308],
    [
      "/apps/org.mozilla.firefox/flatpakhttps",
      "flatpak+https://dl.flathub.org/repo/appstream/org.mozilla.firefox.flatpakref",
      307,
    ],
    [
      "/en/apps/org.mozilla.firefox/flatpakhttps",
      "flatpak+https://dl.flathub.org/repo/appstream/org.mozilla.firefox.flatpakref",
      307,
    ],
    [
      "/en/apps/category/graphics/?page=2",
      "https://example.test/en/apps/category/graphics?page=2",
      308,
    ],
    [
      "/apps/search/hello%20world?q=ignored&tag=a&tag=b",
      "https://example.test/en/apps/search?q=hello+world&tag=a&tag=b",
      308,
    ],
    ["/pipelines/123", "https://example.test/en/builds/123", 308],
  ]) {
    const result = redirectResponse(request(path))
    assert.equal(result.status, status, path)
    assert.equal(result.headers.get("location"), target, path)
  }
  for (const path of [
    "/",
    "/en",
    "/en/about",
    "/en/apps/org.mozilla.firefox",
    "/_next/apps/x/flatpakhttps",
    "/HOME",
  ]) {
    assert.equal(redirectResponse(request(path)), undefined, path)
  }
})

test("specific headers override defaults and app surrogate keys expand", () => {
  for (const path of ["/en/login/email/confirm", "/de/login/email/confirm/"]) {
    const response = applyHeaders(request(path), new Response())
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(response.headers.get("x-frame-options"), "Deny")
  }
  const app = applyHeaders(
    request("/en/apps/org.mozilla.firefox"),
    new Response(),
  )
  assert.equal(app.headers.get("surrogate-key"), "app-org.mozilla.firefox")
  assert.equal(
    app.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  )
  assert.equal(app.headers.get("x-accel-buffering"), "no")
})

test("CSP uses the supplied origin and retains development behavior", () => {
  const policy = (production) =>
    headers({ production, siteBaseUri: "https://staging.example.test" })
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === "Content-Security-Policy").value
  assert.equal(policy(false), "")
  assert.match(
    policy(true),
    /^base-uri 'self' https:\/\/staging\.example\.test;/,
  )
})
