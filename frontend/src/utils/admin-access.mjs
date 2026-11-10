export function hasAdminAccess(user) {
  return (
    Array.isArray(user?.permissions) &&
    [
      "moderation",
      "quality-moderation",
      "view-users",
      "modify-users",
      "manage-oidc-clients",
    ].some((permission) => user?.permissions?.includes(permission))
  )
}
