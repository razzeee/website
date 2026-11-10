export const protectedRoutes = [
  ["app-purchase-legacy", "apps/:appId/purchase"],
  ["app-purchase", "apps/purchase/:appId"],
  ["app-manage", "apps/manage/:appId"],
  ["app-accept-invite", "apps/manage/:appId/accept-invite"],
  [
    "app-invite-agreement",
    "apps/manage/:appId/accept-invite/publisher-agreement",
  ],
  ["app-new", "apps/new"],
  ["app-new-agreement", "apps/new/publisher-agreement"],
  ["app-register", "apps/new/register"],
  ["admin", "admin"],
  ["admin-app-picks", "admin/app-picks"],
  ["admin-direct-uploads", "admin/direct-uploads"],
  ["admin-homepage-selections", "admin/homepage-selections"],
  ["admin-maintenance", "admin/maintenance"],
  ["admin-permission-statistics", "admin/permission-statistics"],
  ["admin-permission-rules", "admin/moderation/permission-rules"],
  ["admin-permission-reviews", "admin/moderation/permissions"],
  ["admin-permission-review", "admin/moderation/permissions/:assessmentId"],
  ["admin-moderation", "admin/moderation"],
  ["admin-app-moderation", "admin/moderation/:app"],
  ["admin-oidc-clients", "admin/oidc-clients"],
  ["admin-quality-moderation", "admin/quality-moderation"],
  ["admin-roles", "admin/roles"],
  ["admin-users", "admin/users"],
  ["admin-user", "admin/users/:user"],
  ["donate", "donate"],
  ["wallet", "wallet"],
  ["my-flathub", "my-flathub"],
  ["purchase", "purchase"],
  ["purchase-checkout", "purchase/checkout"],
  ["purchase-finished", "purchase/finished"],
  ["payment-details", "payment/details/:transaction_id"],
  ["payment", "payment/:transaction_id"],
  ["developer-portal", "developer-portal"],
]

export function matchProtectedRoute(segments) {
  for (const [kind, pattern] of protectedRoutes) {
    const parts = pattern.split("/")
    if (parts.length !== segments.length) {
      continue
    }
    const params = {}
    if (
      parts.every((part, index) => {
        if (!part.startsWith(":")) {
          return part === segments[index]
        }
        params[part.slice(1)] = segments[index]
        return !!segments[index]
      })
    ) {
      return { kind, params }
    }
  }
}
