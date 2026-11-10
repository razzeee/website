export const protectedPages = {
  "app-purchase-legacy": () =>
    import("../../../app/[locale]/apps/[appId]/purchase/page"),
  "app-purchase": () =>
    import("../../../app/[locale]/apps/purchase/[appId]/page"),
  "app-manage": () => import("../../../app/[locale]/apps/manage/[appId]/page"),
  "app-accept-invite": () =>
    import("../../../app/[locale]/apps/manage/[appId]/accept-invite/page"),
  "app-invite-agreement": () =>
    import("../../../app/[locale]/apps/manage/[appId]/accept-invite/publisher-agreement/page"),
  "app-new": () => import("../../../app/[locale]/apps/new/page"),
  "app-new-agreement": () =>
    import("../../../app/[locale]/apps/new/publisher-agreement/page"),
  "app-register": () => import("../../../app/[locale]/apps/new/register/page"),
  admin: () => import("../../../app/[locale]/(protected)/admin/page"),
  "admin-app-picks": () =>
    import("../../../app/[locale]/(protected)/admin/app-picks/page"),
  "admin-direct-uploads": () =>
    import("../../../app/[locale]/(protected)/admin/direct-uploads/page"),
  "admin-homepage-selections": () =>
    import("../../../app/[locale]/(protected)/admin/homepage-selections/page"),
  "admin-maintenance": () =>
    import("../../../app/[locale]/(protected)/admin/maintenance/page"),
  "admin-permission-statistics": () =>
    import("../../../app/[locale]/(protected)/admin/permission-statistics/page"),
  "admin-permission-rules": () =>
    import("../../../app/[locale]/(protected)/admin/moderation/permission-rules/page"),
  "admin-permission-reviews": () =>
    import("../../../app/[locale]/(protected)/admin/moderation/permissions/page"),
  "admin-permission-review": () =>
    import("../../../app/[locale]/(protected)/admin/moderation/permissions/[assessmentId]/page"),
  "admin-moderation": () =>
    import("../../../app/[locale]/(protected)/admin/moderation/page"),
  "admin-app-moderation": () =>
    import("../../../app/[locale]/(protected)/admin/moderation/[app]/page"),
  "admin-oidc-clients": () =>
    import("../../../app/[locale]/(protected)/admin/oidc-clients/page"),
  "admin-quality-moderation": () =>
    import("../../../app/[locale]/(protected)/admin/quality-moderation/page"),
  "admin-roles": () =>
    import("../../../app/[locale]/(protected)/admin/roles/page"),
  "admin-users": () =>
    import("../../../app/[locale]/(protected)/admin/users/page"),
  "admin-user": () =>
    import("../../../app/[locale]/(protected)/admin/users/[user]/page"),
  donate: () => import("../../../app/[locale]/(protected)/donate/page"),
  wallet: () => import("../../../app/[locale]/(protected)/wallet/page"),
  "my-flathub": () =>
    import("../../../app/[locale]/(protected)/my-flathub/page"),
  purchase: () => import("../../../app/[locale]/(protected)/purchase/page"),
  "purchase-checkout": () =>
    import("../../../app/[locale]/(protected)/purchase/checkout/page"),
  "purchase-finished": () =>
    import("../../../app/[locale]/(protected)/purchase/finished/page"),
  "payment-details": () =>
    import("../../../app/[locale]/(protected)/payment/details/[transaction_id]/page"),
  payment: () =>
    import("../../../app/[locale]/(protected)/payment/[transaction_id]/page"),
  "developer-portal": () =>
    import("../../../app/[locale]/(protected)/developer-portal/page"),
}
