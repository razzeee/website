import { createServer } from "node:http"

// Playwright does not route subsequent documents in a redirect chain. Keep CSP
// enabled and apply the sandbox-only connect exception to every HTTP response.
export async function createCspProxy(origin, { port = 0 } = {}) {
  let base
  const server = createServer(async (request, response) => {
    try {
      const upstream = await fetch(origin + request.url, {
        method: request.method,
        headers: request.headers,
        redirect: "manual",
      })
      const headers = Object.fromEntries(upstream.headers)
      delete headers["content-encoding"]
      delete headers["content-length"]
      if (headers["content-security-policy"]) {
        headers["content-security-policy"] = headers[
          "content-security-policy"
        ].replace(
          "connect-src 'self'",
          "connect-src 'self' http://127.0.0.1:4101",
        )
      }
      if (headers.location) {
        headers.location = headers.location.replace(origin, base)
      }
      response.writeHead(upstream.status, headers)
      response.end(Buffer.from(await upstream.arrayBuffer()))
    } catch {
      response.writeHead(502).end()
    }
  })
  await new Promise((done) => server.listen(port, "127.0.0.1", done))
  base = `http://127.0.0.1:${server.address().port}`
  return { base, close: () => new Promise((done) => server.close(done)) }
}
