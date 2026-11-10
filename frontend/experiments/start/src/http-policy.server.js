import { pathToRegexp } from "path-to-regexp"
import { headers, redirects } from "../../../http-policy.mjs"

function compile(rule) {
  const keys = []
  const regex = pathToRegexp(rule.source, keys, { sensitive: true })
  return { ...rule, regex, keys }
}
const redirectRules = redirects().map(compile)
const headerRules = headers({
  production: process.env.NODE_ENV === "production",
  siteBaseUri: process.env.NEXT_PUBLIC_SITE_BASE_URI,
}).map(compile)

function match(rule, path) {
  const found = path.match(rule.regex)
  if (!found) {
    return null
  }
  const names = rule.keys.map((key) => key.name)
  return Object.fromEntries(
    names.map((name, index) => [name, found[index + 1] || ""]),
  )
}
function expand(value, params) {
  return value.replace(
    /:([A-Za-z][A-Za-z0-9]*)[+*]?/g,
    (all, name) => params[name] ?? all,
  )
}
export function redirectResponse(request) {
  const url = new URL(request.url)
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1)
    return new Response(null, { status: 308, headers: { location: url.href } })
  }
  if (url.pathname.startsWith("/_next")) {
    return
  }
  for (const rule of redirectRules) {
    const params = match(rule, url.pathname)
    if (!params) {
      continue
    }
    const destination = new URL(expand(rule.destination, params), url)
    const destinationKeys = new Set(destination.searchParams.keys())
    for (const [key, value] of url.searchParams) {
      if (!destinationKeys.has(key)) {
        destination.searchParams.append(key, value)
      }
    }
    return new Response(null, {
      status: rule.permanent ? 308 : 307,
      headers: { location: destination.href },
    })
  }
}
export function applyHeaders(request, response) {
  const path = new URL(request.url).pathname
  for (const rule of headerRules) {
    const params = match(rule, path)
    if (params) {
      for (const { key, value } of rule.headers) {
        response.headers.set(key, expand(value, params))
      }
    }
  }
  return response
}
