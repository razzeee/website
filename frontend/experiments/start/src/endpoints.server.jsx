import { NextRequest } from "./adapters/next-server"

export async function endpoint(request) {
  const url = new URL(request.url)
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } })
  }
  const adapted = new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
  })
  if (url.pathname === "/sitemap.xml") {
    const { GET } = await import("../../../app/sitemap.xml/route")
    return GET()
  }
  const sitemap = url.pathname.match(/^\/sitemap\/([^/]+)$/)
  if (sitemap) {
    const { GET } = await import("../../../app/sitemap/[id]/route")
    return GET(adapted, {
      params: Promise.resolve({ id: decodeURIComponent(sitemap[1]) }),
    })
  }
  if (url.pathname === "/robots.txt") {
    const { default: robots } = await import("../../../app/robots")
    const policy = robots()
    const body =
      policy.rules
        .map(
          (rule) =>
            `User-Agent: ${rule.userAgent}\n` +
            (rule.allow ? `Allow: ${rule.allow}\n` : "") +
            (rule.disallow ? `Disallow: ${rule.disallow}\n` : ""),
        )
        .join("\n") + `\nHost: ${policy.host}\nSitemap: ${policy.sitemap}\n`
    return new Response(body, {
      headers: {
        "content-type": "text/plain",
        "cache-control": "public, max-age=0, must-revalidate",
      },
    })
  }
  if (url.pathname === "/api/badge") {
    const { GET } = await import("../../../app/api/badge/route")
    return GET(adapted)
  }
  const app = url.pathname.match(/^\/api\/appOgImage\/([^/]+)$/)
  if (app) {
    const { GET } = await import("../../../app/api/appOgImage/[appId]/route")
    return GET(adapted, {
      params: Promise.resolve({ appId: decodeURIComponent(app[1]) }),
    })
  }
  const year = url.pathname.match(/^\/api\/yearInReviewOgImage\/([^/]+)$/)
  if (year) {
    const { GET } =
      await import("../../../app/api/yearInReviewOgImage/[year]/route")
    return GET(adapted, {
      params: Promise.resolve({ year: decodeURIComponent(year[1]) }),
    })
  }
  return new Response("Not found", { status: 404 })
}
