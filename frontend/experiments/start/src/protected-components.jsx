import { lazy } from "react"
import ProtectedLayout from "../../../app/[locale]/(protected)/protected-layout-client"
import AdminLayout from "../../../app/[locale]/(protected)/admin/admin-layout-client"

export function ProtectedPage({ layout, locale, children }) {
  return (
    <ProtectedLayout>
      {layout === "admin" ? (
        <AdminLayout locale={locale}>{children}</AdminLayout>
      ) : (
        children
      )}
    </ProtectedLayout>
  )
}

export const protectedComponents = {
  "app-purchase-legacy": lazy(
    () => import("../../../app/[locale]/apps/[appId]/purchase/purchase-client"),
  ),
  "app-purchase": lazy(
    () =>
      import("../../../app/[locale]/apps/purchase/[appId]/app-purchase-client"),
  ),
  "app-manage": lazy(
    () => import("../../../app/[locale]/apps/manage/[appId]/manage-client"),
  ),
  "app-accept-invite": lazy(
    () =>
      import("../../../app/[locale]/apps/manage/[appId]/accept-invite/accept-invite-client"),
  ),
  "app-invite-agreement": lazy(
    () =>
      import("../../../app/[locale]/apps/manage/[appId]/accept-invite/publisher-agreement/publisher-agreement-client"),
  ),
  "app-new": lazy(
    () => import("../../../app/[locale]/apps/new/new-app-client"),
  ),
  "app-new-agreement": lazy(
    () =>
      import("../../../app/[locale]/apps/new/publisher-agreement/publisher-agreement-client"),
  ),
  "app-register": lazy(
    () => import("../../../app/[locale]/apps/new/register/register-client"),
  ),
  "admin-permission-review": lazy(() => import("./permission-review")),
  "developer-portal": lazy(
    () =>
      import("../../../app/[locale]/(protected)/developer-portal/developer-portal-client"),
  ),
  payment: lazy(
    () =>
      import("../../../app/[locale]/(protected)/payment/[transaction_id]/payment-client"),
  ),
  admin: lazy(
    () => import("../../../app/[locale]/(protected)/admin/admin-page-client"),
  ),
  "admin-app-picks": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/app-picks/app-picks-client"),
  ),
  "admin-direct-uploads": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/direct-uploads/direct-uploads-client"),
  ),
  "admin-homepage-selections": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/homepage-selections/homepage-selections-client"),
  ),
  "admin-maintenance": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/maintenance/maintenance-client"),
  ),
  "admin-permission-statistics": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/permission-statistics/permissions-client"),
  ),
  "admin-permission-rules": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/moderation/permission-rules/permission-rules-client"),
  ),
  "admin-permission-reviews": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/moderation/permissions/permission-reviews-client"),
  ),
  "admin-moderation": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/moderation/moderation-client"),
  ),
  "admin-app-moderation": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/moderation/[app]/app-moderation-client"),
  ),
  "admin-oidc-clients": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/oidc-clients/oidc-clients-client"),
  ),
  "admin-quality-moderation": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/quality-moderation/quality-moderation-client"),
  ),
  "admin-roles": lazy(
    () => import("../../../app/[locale]/(protected)/admin/roles/roles-client"),
  ),
  "admin-users": lazy(
    () => import("../../../app/[locale]/(protected)/admin/users/users-client"),
  ),
  "admin-user": lazy(
    () =>
      import("../../../app/[locale]/(protected)/admin/users/[user]/user-admin-client"),
  ),
  donate: lazy(
    () => import("../../../app/[locale]/(protected)/donate/donate-client"),
  ),
  wallet: lazy(
    () => import("../../../app/[locale]/(protected)/wallet/wallet-client"),
  ),
  "my-flathub": lazy(
    () =>
      import("../../../app/[locale]/(protected)/my-flathub/my-flathub-client"),
  ),
  purchase: lazy(
    () =>
      import("../../../app/[locale]/(protected)/purchase/purchase-workflow-client"),
  ),
  "purchase-checkout": lazy(
    () =>
      import("../../../app/[locale]/(protected)/purchase/checkout/checkout-client"),
  ),
  "purchase-finished": lazy(
    () =>
      import("../../../app/[locale]/(protected)/purchase/finished/purchase-finished-client"),
  ),
  "payment-details": lazy(
    () =>
      import("../../../app/[locale]/(protected)/payment/details/[transaction_id]/payment-details-client"),
  ),
}
