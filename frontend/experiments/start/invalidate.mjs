import { pageCache } from "./src/cache.server.mjs"
import { invalidatePages } from "./src/cdn.server.mjs"
import { parseArgs } from "node:util"
import { isLocale } from "./src/locales.mjs"

const { values, positionals: paths } = parseArgs({
  options: { cdn: { type: "boolean" } },
  allowPositionals: true,
})
if (
  !paths.length ||
  paths.some(
    (path) =>
      !path.startsWith("/") ||
      !isLocale(path.split("/")[1]) ||
      /[?#\s]/.test(path),
  )
) {
  throw new Error("Provide one or more absolute route paths")
}
if (
  values.cdn &&
  (!process.env.FASTLY_SERVICE_ID || !process.env.FASTLY_API_TOKEN)
) {
  throw new Error(
    "CDN invalidation requires FASTLY_SERVICE_ID and FASTLY_API_TOKEN",
  )
}
if (!process.env.REDIS_URL || !process.env.GITHUB_SHA?.trim()) {
  throw new Error("Provide REDIS_URL and the deployment's GITHUB_SHA")
}
const cache = pageCache()
try {
  await invalidatePages(paths, {
    cache,
    purge: async (keys) => {
      if (!values.cdn) {
        console.log(
          `Origin invalidated. CDN keys still need purging: ${keys.join(" ")}`,
        )
        return
      }
      for (const key of keys) {
        const response = await fetch(
          `https://api.fastly.com/service/${encodeURIComponent(process.env.FASTLY_SERVICE_ID)}/purge/${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Fastly-Key": process.env.FASTLY_API_TOKEN },
            signal: AbortSignal.timeout(10000),
          },
        )
        if (!response.ok) {
          throw new Error(
            `CDN purge failed (${response.status}) for ${key}; retry invalidation`,
          )
        }
      }
      console.log(`Origin and CDN invalidated for ${paths.length} paths`)
    },
  })
} finally {
  await cache.close()
}
