export const publicRoutes = [
  ["year-in-review", "year-in-review/:year"],
  ["builds-reproducible", "builds/reproducible"],
  ["builds-app", "builds/apps/:appId"],
  ["builds-detail", "builds/:id"],
  ["builds", "builds"],
  ["statistics", "statistics"],
  ["bannerpreview", "apps/:appId/bannerpreview"],
  ["server-error", "500"],
  ["unauthorized", "unauthorized"],
  ["subcategory", "apps/category/:category/subcategories/:subcategory/:page"],
  ["popular", "apps/collection/popular/:page"],
  ["trending", "apps/collection/trending/:page"],
  ["verified", "apps/collection/verified/:page"],
  ["mobile", "apps/collection/mobile/:page"],
  ["recently-added", "apps/collection/recently-added/:page"],
  ["recently-updated", "apps/collection/recently-updated/:page"],
  ["developer-collection", "apps/collection/developer/:developer/:page"],
  ["tag", "apps/collection/tag/:tag/:page"],
  ["install", "apps/:appId/install"],
  ["setup", "setup"],
  ["distro", "setup/:distro"],
  ["badges", "badges"],
  ["feeds", "feeds"],
  ["languages", "languages"],
  ["consultants", "consultants"],
  ["privacy-policy", "privacy-policy"],
  ["terms-and-conditions", "terms-and-conditions"],
]

export function matchPublicRoute(segments) {
  for (const [kind, pattern] of publicRoutes) {
    const parts = pattern.split("/")
    if (parts.length !== segments.length) {
      continue
    }
    const params = {}
    if (
      parts.every((part, index) => {
        if (!segments[index]) {
          return false
        }
        if (!part.startsWith(":")) {
          return part === segments[index]
        }
        params[part.slice(1)] = segments[index]
        return true
      })
    ) {
      return { kind, params }
    }
  }
}
